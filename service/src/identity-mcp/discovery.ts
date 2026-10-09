/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getContext } from '../context/request-context';
import { logger } from '../utils/logger.utils';
import { auth2Url, isCommercetoolsAuthHost } from './region';
import type { IdentityMcpDiscovery } from './types';

/**
 * A read-only probe of an MCP Server's OAuth discovery chain.
 *
 * ## Why this exists rather than leaning on the SDK
 *
 * `@ai-sdk/mcp`'s `authInternal` wraps protected-resource-metadata discovery in a bare
 * `catch {}` and then falls back to `authorizationServerUrl = serverUrl`. Its authorization
 * server metadata lookup likewise returns `undefined` rather than throwing when every
 * candidate 4xxs, after which `startAuthorization` synthesises `{as}/authorize` and
 * `{as}/token`. And its fetch helper swallows `TypeError` and continues.
 *
 * The consequence is that a 404, a malformed document, metadata naming a host that has no
 * metadata of its own, and a transient DNS failure ALL converge on one downstream symptom:
 * the popup opens something that is not a login page. That is precisely the shape of failure
 * that cannot be diagnosed from a log afterwards.
 *
 * So the probe runs first, on our own terms, and records what it saw. It answers the
 * question this branch exists to settle - which authorization server does an identity-mode
 * server actually name? - before any token work is attempted.
 *
 * Everything here is read-only: unauthenticated GETs and one unauthenticated POST that is
 * expected to be refused.
 */

const LOG_PREFIX = '[mcp-identity]';
const PROBE_TIMEOUT_MS = 10_000;

const rid = (): string => getContext()?.requestId?.slice(0, 8) ?? '-';

export type DiscoveryVerdict =
  /** The metadata named `auth2.{region}` - the identity-mode server. */
  | 'auth2'
  /** It named `auth.{region}` - the CLIENT-CREDENTIALS server. */
  | 'client-credentials-as'
  /** It named the upstream user IdP, which has no dynamic registration. */
  | 'upstream-idp'
  /** No metadata, so the SDK would treat the MCP server as its own auth server. */
  | 'no-metadata'
  /** Something else entirely. */
  | 'unexpected';

export interface AuthServerMetadataSnapshot {
  status: number;
  issuer?: string;
  registrationEndpoint?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
  grantTypes?: string[];
  codeChallengeMethods?: string[];
  tokenEndpointAuthMethods?: string[];
  scopesSupported?: string[];
}

export interface IdentityDiscoveryResult {
  verdict: DiscoveryVerdict;
  /** What the 401 challenge advertised, verbatim. Carries no secret. */
  wwwAuthenticate?: string;
  challengeStatus?: number;
  resourceMetadataUrl?: string;
  resourceMetadataStatus?: number;
  resource?: string;
  authorizationServers: string[];
  scopesSupported?: string[];
  authorizationServer?: string;
  /** What we would have expected for this region, for comparison in the log. */
  expectedAuthorizationServer: string;
  asMetadata?: AuthServerMetadataSnapshot;
  /** Whether an unauthenticated registration attempt reached a live DCR endpoint. */
  dcrReachable?: boolean;
  dcrDetail?: string;
  problems: string[];
}

const fetchWithTimeout = async (
  url: string,
  init: Parameters<typeof fetch>[1] = {}
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      // A redirect here would move the probe off the host we are trying to characterise.
      redirect: 'manual',
    });
  } finally {
    clearTimeout(timer);
  }
};

/** Pull the `resource_metadata` parameter out of a `WWW-Authenticate` challenge. */
const resourceMetadataFromChallenge = (
  header: string | null
): string | undefined => {
  if (!header) return undefined;
  const match = /resource_metadata="([^"]+)"/i.exec(header);
  return match?.[1];
};

/**
 * Probe one Managed MCP Server's discovery chain.
 *
 * Never throws: every failure becomes a `problems` entry and a verdict, because a probe that
 * dies is strictly less useful than one that reports how far it got.
 */
export const probeIdentityMcp = async (params: {
  apiRegion: string;
  mcpUrl: string;
  /** Attempt an unauthenticated DCR POST. Read-only in effect: it registers nothing. */
  probeRegistration?: boolean;
}): Promise<IdentityDiscoveryResult> => {
  const { apiRegion, mcpUrl, probeRegistration = true } = params;
  const problems: string[] = [];
  const expected = auth2Url(apiRegion);

  const log = (message: string) => `${LOG_PREFIX} rid=${rid()} ${message}`;

  const result: IdentityDiscoveryResult = {
    verdict: 'unexpected',
    authorizationServers: [],
    expectedAuthorizationServer: expected,
    problems,
  };

  // -- 1. The unauthenticated challenge ---------------------------------------------------

  logger.info(log(`PROBE_START url=${mcpUrl}`));

  try {
    const challenge = await fetchWithTimeout(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'ct-ai-assistant-probe', version: '0' },
        },
      }),
    });

    result.challengeStatus = challenge.status;
    result.wwwAuthenticate =
      challenge.headers.get('www-authenticate') ?? undefined;

    if (challenge.status !== 401) {
      problems.push(
        `expected 401 from an unauthenticated handshake, got ${challenge.status}`
      );
      const body = await challenge.text().catch(() => '');
      logger.error(
        log(
          `PROBE_NOT_401 status=${challenge.status} body="${body.slice(0, 200)}" ` +
            '- this is a wrong URL, region or server key, NOT an auth problem'
        )
      );
    } else if (!result.wwwAuthenticate) {
      problems.push('401 carried no WWW-Authenticate challenge');
      logger.error(
        log(
          'PROBE_NO_WWWAUTH status=401 - no discovery is possible from this server'
        )
      );
    } else {
      logger.info(log(`PROBE_401_OK wwwAuth="${result.wwwAuthenticate}"`));
    }

    result.resourceMetadataUrl = resourceMetadataFromChallenge(
      result.wwwAuthenticate ?? null
    );

    if (!result.resourceMetadataUrl && result.wwwAuthenticate) {
      problems.push('challenge advertised no resource_metadata');
      logger.error(
        log(`PROBE_NO_RESOURCE_METADATA wwwAuth="${result.wwwAuthenticate}"`)
      );
    }
  } catch (error) {
    problems.push(`challenge request failed: ${(error as Error).message}`);
    logger.error(log(`PROBE_REQUEST_FAILED ${(error as Error).message}`));
  }

  // -- 2. Protected-resource metadata -----------------------------------------------------

  if (result.resourceMetadataUrl) {
    // The SDK refuses a metadata URL off the MCP server's origin, and so do we - a
    // cross-origin pointer is how a compromised gateway would redirect discovery.
    const sameOrigin =
      new URL(result.resourceMetadataUrl).origin === new URL(mcpUrl).origin;

    if (!sameOrigin) {
      problems.push(
        `resource_metadata is cross-origin: ${result.resourceMetadataUrl}`
      );
      logger.error(
        log(
          `PRM_CROSS_ORIGIN prm=${new URL(result.resourceMetadataUrl).origin} ` +
            `expected=${new URL(mcpUrl).origin}`
        )
      );
    } else {
      try {
        const prm = await fetchWithTimeout(result.resourceMetadataUrl);
        result.resourceMetadataStatus = prm.status;

        if (!prm.ok) {
          problems.push(`protected-resource metadata returned ${prm.status}`);
          logger.error(
            log(
              `PRM_HTTP_ERROR url=${result.resourceMetadataUrl} status=${prm.status}`
            )
          );
        } else {
          const doc = (await prm.json()) as {
            resource?: string;
            authorization_servers?: string[];
            scopes_supported?: string[];
          };

          result.resource = doc.resource;
          result.authorizationServers = Array.isArray(doc.authorization_servers)
            ? doc.authorization_servers
            : [];
          result.scopesSupported = doc.scopes_supported;

          // The line that answers the open question.
          logger.info(
            log(
              `PRM_OK resource="${doc.resource ?? 'ABSENT'}" ` +
                `authorization_servers=[${result.authorizationServers.join(', ')}] ` +
                `scopes_supported=[${(doc.scopes_supported ?? []).join(', ')}]`
            )
          );

          if (result.authorizationServers.length === 0) {
            problems.push('metadata listed no authorization_servers');
            logger.error(
              log(
                'PRM_NO_AS - the SDK would silently fall back to treating the MCP ' +
                  'server as its own authorization server'
              )
            );
          }
        }
      } catch (error) {
        problems.push(
          `protected-resource metadata unreadable: ${(error as Error).message}`
        );
        logger.error(log(`PRM_PARSE_ERROR ${(error as Error).message}`));
      }
    }
  }

  // -- 3. Classify -----------------------------------------------------------------------

  result.authorizationServer = result.authorizationServers[0];

  if (!result.authorizationServer) {
    result.verdict = 'no-metadata';
    logger.error(
      log(
        'AS_VERDICT no-metadata - nothing named an authorization server. Identity mode ' +
          'cannot be driven through the SDK from here'
      )
    );
  } else {
    const host = new URL(result.authorizationServer).host;

    if (host.startsWith('auth2.')) {
      result.verdict = 'auth2';
      logger.info(
        log(
          `AS_VERDICT auth2 as=${result.authorizationServer} expected=${expected} ` +
            `${result.authorizationServer === expected ? '(match)' : '(DIFFERENT REGION?)'}`
        )
      );
    } else if (host === 'auth.identity.commercetools.com') {
      result.verdict = 'upstream-idp';
      problems.push(
        'metadata named the upstream user IdP, which has no dynamic registration'
      );
      logger.error(
        log(
          `AS_VERDICT upstream-idp as=${result.authorizationServer} - this host answers ` +
            '404 "Dynamic registration is not enabled." and cannot be used by a backend'
        )
      );
    } else if (host.startsWith('auth.')) {
      result.verdict = 'client-credentials-as';
      problems.push(
        'metadata named the ClientCredentials authorization server, so it appears to be ' +
          'mode-blind'
      );
      logger.error(
        log(
          `AS_VERDICT client-credentials-as as=${result.authorizationServer} - the ` +
            'metadata does not reflect the configured authentication mode. Identity mode ' +
            'cannot be reached by discovery; see the plan for the fallback'
        )
      );
    } else {
      result.verdict = 'unexpected';
      problems.push(`unrecognised authorization server host: ${host}`);
      logger.error(
        log(`AS_VERDICT unexpected as=${result.authorizationServer}`)
      );
    }

    if (!isCommercetoolsAuthHost(host)) {
      problems.push(
        `authorization server is not a commercetools host: ${host} - refusing`
      );
    }
  }

  // -- 4. Authorization server metadata ---------------------------------------------------

  if (
    result.authorizationServer &&
    isCommercetoolsAuthHost(new URL(result.authorizationServer).host)
  ) {
    const metadataUrl = `${result.authorizationServer.replace(
      /\/+$/,
      ''
    )}/.well-known/oauth-authorization-server`;

    try {
      const response = await fetchWithTimeout(metadataUrl);
      const snapshot: AuthServerMetadataSnapshot = { status: response.status };

      if (response.ok) {
        const doc = (await response.json()) as Record<string, unknown>;
        snapshot.issuer = doc.issuer as string;
        snapshot.registrationEndpoint = doc.registration_endpoint as string;
        snapshot.authorizationEndpoint = doc.authorization_endpoint as string;
        snapshot.tokenEndpoint = doc.token_endpoint as string;
        snapshot.deviceAuthorizationEndpoint =
          doc.device_authorization_endpoint as string;
        snapshot.grantTypes = doc.grant_types_supported as string[];
        snapshot.codeChallengeMethods =
          doc.code_challenge_methods_supported as string[];
        snapshot.tokenEndpointAuthMethods =
          doc.token_endpoint_auth_methods_supported as string[];
        snapshot.scopesSupported = doc.scopes_supported as string[];

        logger.info(
          log(
            `ASMETA_OK issuer=${snapshot.issuer} ` +
              `registration_endpoint=${snapshot.registrationEndpoint ?? 'ABSENT'} ` +
              `token_endpoint=${snapshot.tokenEndpoint} ` +
              `grants=[${(snapshot.grantTypes ?? []).join(', ')}] ` +
              `pkce=[${(snapshot.codeChallengeMethods ?? []).join(', ')}] ` +
              `auth_methods=[${(snapshot.tokenEndpointAuthMethods ?? []).join(', ')}] ` +
              `scopes=[${(snapshot.scopesSupported ?? []).join(', ')}]`
          )
        );

        if (!snapshot.registrationEndpoint) {
          problems.push(
            'authorization server publishes no registration_endpoint, so the service ' +
              'cannot obtain a client_id itself'
          );
          logger.error(
            log('ASMETA_NO_REG - dynamic registration is unavailable')
          );
        }

        if (!(snapshot.codeChallengeMethods ?? []).includes('S256')) {
          problems.push(
            'authorization server does not advertise PKCE S256, which the SDK hardcodes'
          );
          logger.error(
            log(
              `ASMETA_NO_S256 methods=[${(snapshot.codeChallengeMethods ?? []).join(', ')}]`
            )
          );
        }
      } else {
        problems.push(
          `authorization server metadata returned ${response.status}`
        );
        logger.error(
          log(
            `ASMETA_MISSING url=${metadataUrl} status=${response.status} - the SDK would ` +
              'synthesise {as}/authorize and {as}/token instead of failing'
          )
        );
      }

      result.asMetadata = snapshot;
    } catch (error) {
      problems.push(
        `authorization server metadata unreadable: ${(error as Error).message}`
      );
      logger.error(log(`ASMETA_FAILED ${(error as Error).message}`));
    }
  }

  // -- 5. Is registration actually live? --------------------------------------------------

  if (probeRegistration && result.asMetadata?.registrationEndpoint) {
    // An intentionally invalid body. A conformant server answers 400
    // `invalid_client_metadata`, which proves the endpoint is reachable and unauthenticated
    // WITHOUT registering anything. A 401 would mean it needs credentials we do not have;
    // a 404 would mean the feature is off despite being advertised.
    try {
      const response = await fetchWithTimeout(
        result.asMetadata.registrationEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const body = await response.text().catch(() => '');
      result.dcrReachable = response.status === 400;
      result.dcrDetail = `${response.status} ${body.slice(0, 200)}`;

      if (response.status === 400) {
        logger.info(
          log(
            `DCR_REACHABLE status=400 (validation error, as expected) body="${body.slice(0, 160)}"`
          )
        );
      } else {
        problems.push(
          `registration endpoint answered ${response.status} to a validation probe`
        );
        logger.error(
          log(
            `DCR_UNEXPECTED status=${response.status} body="${body.slice(0, 200)}" - ` +
              '400 invalid_client_metadata was expected; 401 means it needs credentials, ' +
              '404 means registration is disabled despite being advertised'
          )
        );
      }
    } catch (error) {
      problems.push(`registration probe failed: ${(error as Error).message}`);
      logger.error(log(`DCR_PROBE_FAILED ${(error as Error).message}`));
    }
  }

  logger.info(
    log(
      `PROBE_DONE verdict=${result.verdict} problems=${problems.length}` +
        (problems.length ? ` [${problems.join('; ')}]` : '')
    )
  );

  return result;
};

/** The persisted subset of a probe. */
export const toStoredDiscovery = (
  result: IdentityDiscoveryResult
): IdentityMcpDiscovery => ({
  resourceMetadataUrl: result.resourceMetadataUrl,
  resource: result.resource,
  authorizationServers: result.authorizationServers,
  scopesSupported: result.scopesSupported,
  probedAt: Date.now(),
});
