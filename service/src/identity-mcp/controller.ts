/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import { auth } from '@ai-sdk/mcp';
import type { Request, RequestHandler, Response } from 'express';
import CustomError from '../errors/custom.error';
import { auditAdminAction } from '../middleware/require-admin.middleware';
import type { AuthenticatedRequest } from '../types/request.types';
import { asyncHandler, ok } from '../utils/api-response';
import { logger } from '../utils/logger.utils';
import { createIdentityMcpAuthProvider } from './auth-provider';
import { readIdentityConnection, sameRevision } from './connection';
import {
  OAUTH_MESSAGE_TYPE,
  SERVER_KEY_PATTERN,
  SHORT_FETCH_TIMEOUT_MS,
} from './constants';
import { probeIdentityMcp, toStoredDiscovery } from './discovery';
import {
  IdentityNoPermittedToolsError,
  IdentityReauthRequiredError,
} from './errors';
import {
  callbackUrl,
  identityScope,
  isValidIdentityUserId,
  MissingAudienceError,
} from './keys';
import { managedMcpUrl } from './region';
import { revokeStoredTokens } from './revocation';
import { getIdentityRuntime } from './runtime';
import {
  getIdentityMcpToolSet,
  invalidateAllToolSets,
  invalidateToolSetsForUser,
} from './toolset';
import type { IdentityBinding, PublicIdentityBinding } from './types';

const LOG_PREFIX = '[mcp-identity]';
const MAJOR_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,16}$/;
const MAX_CALLBACK_TEXT = 200;

const toPublicBinding = (b: IdentityBinding): PublicIdentityBinding => ({
  serverKey: b.serverKey,
  url: b.url,
  majorVersion: b.majorVersion,
  authenticationMode: b.authenticationMode,
  connectedAt: b.connectedAt,
  discovery: b.discovery,
});

const requireUserId = (req: Request): string => {
  const userId = (req as Partial<AuthenticatedRequest>).user?.userId;
  if (!userId) throw new CustomError(401, 'Authentication required');
  if (!isValidIdentityUserId(userId))
    throw new CustomError(400, 'Invalid user');
  return userId;
};

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

// -- Binding: GET / PUT / DELETE --------------------------------------------------------

export const getIdentityMcp: RequestHandler = asyncHandler(
  async (_req, res) => {
    const binding = await getIdentityRuntime().stores.binding.get();
    if (!binding) {
      throw new CustomError(
        404,
        'No identity-mode Managed MCP Server is bound to this project',
        { code: 'IDENTITY_MCP_NOT_CONFIGURED' }
      );
    }
    ok(res, toPublicBinding(binding));
  }
);

export const putIdentityMcp: RequestHandler = asyncHandler(async (req, res) => {
  const authed = req as AuthenticatedRequest;
  const { config, stores, fetchFn } = getIdentityRuntime();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const serverKey = body.serverKey;

  if (typeof serverKey !== 'string' || !SERVER_KEY_PATTERN.test(serverKey)) {
    throw new CustomError(
      400,
      'serverKey must be 2-256 characters of letters, digits, hyphen or underscore'
    );
  }
  const expectedUrl = managedMcpUrl(
    config.ctp.region,
    config.ctp.projectKey,
    serverKey
  );
  if (body.url !== undefined && body.url !== expectedUrl) {
    throw new CustomError(
      400,
      `url does not match this project's Managed MCP Server address. Expected ${expectedUrl}`
    );
  }
  const majorVersion =
    typeof body.majorVersion === 'string' && body.majorVersion
      ? body.majorVersion
      : 'v4';
  if (!MAJOR_VERSION_PATTERN.test(majorVersion)) {
    throw new CustomError(400, 'majorVersion is malformed');
  }

  const discovery = await probeIdentityMcp({
    apiRegion: config.ctp.region,
    mcpUrl: expectedUrl,
    fetchFn,
  });
  if (discovery.verdict !== 'auth2') {
    throw new CustomError(
      400,
      `Managed MCP Server "${serverKey}" did not advertise commercetools Identity ` +
        `(discovery verdict: ${discovery.verdict})`
    );
  }

  const binding: IdentityBinding = {
    serverKey,
    url: expectedUrl,
    majorVersion,
    authenticationMode: 'CommercetoolsIdentity',
    connectedAt: Date.now(),
    discovery: toStoredDiscovery(discovery),
  };
  // `set` drops the stored OAuth client: the next authorize registers a fresh one. The token
  // records of the previous binding belong to the dropped client, so they are removed (and
  // revoked best effort, while the old client registration is still readable) like on
  // DELETE; users merely have to reconnect.
  const previous = await stores.binding.get();
  const removedTokens = previous
    ? await stores.tokens.deleteAll((record) =>
        revokeStoredTokens(config, previous, record, fetchFn)
      )
    : 0;
  await stores.binding.set(binding);
  if (removedTokens > 0) {
    logger.info(`${LOG_PREFIX} REBOUND tokensRemoved=${removedTokens}`);
  }
  await invalidateAllToolSets();
  auditAdminAction(authed, 'managed-mcp-identity.put', 'ok');

  ok(res, toPublicBinding(binding));
});

export const deleteIdentityMcp: RequestHandler = asyncHandler(
  async (req, res) => {
    const authed = req as AuthenticatedRequest;
    const { config, stores, fetchFn } = getIdentityRuntime();
    const binding = await stores.binding.get();

    // Tokens first (and revoked while the client registration is still readable), then the
    // binding: if the second step fails, users merely have to reconnect.
    const removed = await stores.tokens.deleteAll((record) =>
      binding
        ? revokeStoredTokens(config, binding, record, fetchFn)
        : Promise.resolve()
    );
    await stores.binding.clear();
    await invalidateAllToolSets();
    logger.info(`${LOG_PREFIX} UNBOUND tokensRemoved=${removed}`);
    auditAdminAction(authed, 'managed-mcp-identity.delete', 'ok');

    res.json({ success: true, message: 'Identity MCP Server binding removed' });
  }
);

// -- Status / verify / disconnect ---------------------------------------------------------

export const getIdentityMcpStatus: RequestHandler = asyncHandler(
  async (req, res) => {
    const userId = requireUserId(req);
    const { stores } = getIdentityRuntime();
    // Metadata only: this endpoint never decrypts a token.
    const connection = await readIdentityConnection(stores, userId);
    if (!connection.binding) {
      ok(res, { configured: false, connected: false });
      return;
    }
    ok(res, {
      configured: true,
      connected: connection.connected,
      serverKey: connection.binding.serverKey,
      ...(connection.connected && connection.token
        ? {
            hasRefreshToken: connection.token.hasRefreshToken,
            accessTokenExpiresAt: connection.token.accessTokenExpiresAt,
            scope: connection.token.scope,
          }
        : {}),
    });
  }
);

export const verifyIdentityMcp: RequestHandler = asyncHandler(
  async (req, res) => {
    const userId = requireUserId(req);
    const { config, stores, fetchFn } = getIdentityRuntime();
    const binding = await stores.binding.get();
    if (!binding) throw new CustomError(409, 'No identity MCP Server is bound');

    try {
      const result = await getIdentityMcpToolSet(userId, binding, {
        config,
        stores,
        fetchFn,
      });
      if (!result) {
        throw new CustomError(
          502,
          'Could not complete the identity MCP handshake'
        );
      }
      ok(res, {
        connected: true,
        cached: result.cached,
        toolCount: result.toolNames.length,
        toolNames: result.toolNames,
      });
    } catch (error) {
      if (error instanceof IdentityReauthRequiredError) {
        throw new CustomError(401, error.message, {
          code: 'IDENTITY_REAUTH_REQUIRED',
        });
      }
      if (error instanceof IdentityNoPermittedToolsError) {
        throw new CustomError(403, error.message, {
          code: 'IDENTITY_NO_PERMITTED_TOOLS',
        });
      }
      throw error;
    }
  }
);

export const disconnectIdentityMcpUser: RequestHandler = asyncHandler(
  async (req, res) => {
    const userId = requireUserId(req);
    const { config, stores, fetchFn } = getIdentityRuntime();
    const binding = await stores.binding.get();
    const found = await stores.tokens.get(userId);
    if (found && binding) {
      await revokeStoredTokens(config, binding, found.record, fetchFn);
    }
    await stores.tokens.delete(userId);
    await invalidateToolSetsForUser(userId);
    ok(res, { connected: false });
  }
);

// -- Authorize ---------------------------------------------------------------------------------

/**
 * Whether the authorization server would answer this URL with `invalid_client`. The authorize
 * step runs in the user's browser, so a client the server forgot never reaches
 * `invalidateCredentials`; Hydra answers an unknown client with a 302 to its error fallback,
 * which can be seen without following it. Any other outcome, including a network failure, is
 * "not rejected" so this check can never block a working connect.
 */
export const authorizationRejectsClient = async (
  url: URL,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<boolean> => {
  try {
    const response = await fetchFn(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(SHORT_FETCH_TIMEOUT_MS),
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location)
      return false;
    const target = new URL(location, url);
    return (
      target.pathname.endsWith('/oauth2/fallbacks/error') &&
      target.searchParams.get('error') === 'invalid_client'
    );
  } catch {
    return false;
  }
};

export const authorizeIdentityMcp: RequestHandler = asyncHandler(
  async (req, res) => {
    const userId = requireUserId(req);
    const { config, stores, fetchFn } = getIdentityRuntime();

    let redirectUri: string;
    try {
      redirectUri = callbackUrl(config);
    } catch (error) {
      if (error instanceof MissingAudienceError) {
        throw new CustomError(
          503,
          'MC_AUDIENCE is not configured, so the OAuth callback URL is unknown'
        );
      }
      throw error;
    }
    if (!redirectUri.startsWith('https://')) {
      throw new CustomError(503, 'MC_AUDIENCE must be an HTTPS origin');
    }

    const binding = await stores.binding.get();
    if (!binding) {
      throw new CustomError(
        409,
        'Bind an identity-mode Managed MCP Server before connecting a user'
      );
    }

    // At most one retry: a stored client the authorization server forgot is cleared and
    // re-registered once; a second rejection is a real failure.
    let active: IdentityBinding = binding;
    for (let attempt = 1; ; attempt++) {
      const provider = createIdentityMcpAuthProvider({
        config,
        binding: active,
        userId,
        mode: 'authorize',
        stores,
      });
      const result = await auth(provider, {
        serverUrl: binding.url,
        scope: identityScope(config.ctp.projectKey, binding.serverKey),
        fetchFn,
      });

      if (result === 'AUTHORIZED') {
        ok(res, { connected: true });
        return;
      }

      const authorizationUrl = provider.capturedAuthorizationUrl;
      if (!authorizationUrl) {
        throw new Error(
          'OAuth client returned REDIRECT without an authorization URL'
        );
      }
      logger.info(
        `${LOG_PREFIX} srv=${binding.serverKey} AUTHORIZE_URL attempt=${attempt} ` +
          `client_id=${(authorizationUrl.searchParams.get('client_id') ?? 'ABSENT').slice(0, 6)}... ` +
          `host=${authorizationUrl.host}`
      );

      if (await authorizationRejectsClient(authorizationUrl, fetchFn)) {
        if (attempt >= 2) {
          throw new Error(
            'The authorization server rejected the registered client twice'
          );
        }
        logger.warn(
          `${LOG_PREFIX} srv=${binding.serverKey} CLIENT_UNKNOWN_TO_AS - clearing the stored ` +
            'client and registering again'
        );
        await provider.invalidateCredentials('client');
        active = { ...binding };
        delete active.client;
        continue;
      }

      await provider.persistPendingAttempt();
      ok(res, { connected: false, authorizationUrl: authorizationUrl.href });
      return;
    }
  }
);

// -- Callback (unauthenticated: it authenticates through the claimed state) ------------------

const callbackPage = (
  res: Response,
  outcome: { success: boolean; message: string }
): void => {
  const nonce = randomBytes(18).toString('base64');
  const payload = JSON.stringify({
    type: OAUTH_MESSAGE_TYPE,
    success: outcome.success,
    message: outcome.message.slice(0, MAX_CALLBACK_TEXT),
  }).replace(/</g, '\\u003c');
  const title = outcome.success ? 'Connected' : 'Connection failed';

  res
    .status(outcome.success ? 200 : 400)
    .set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
        "base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    })
    .type('html').send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <p>${
      outcome.success
        ? 'Your commercetools account is connected.'
        : 'The connection could not be completed.'
    }</p>
    <script nonce="${nonce}">
      if (window.opener) window.opener.postMessage(${payload}, '*');
      window.close();
    </script>
  </body>
</html>`);
};

export const callbackIdentityMcp: RequestHandler = async (req, res) => {
  const state = queryString(req.query.state);
  if (!state) {
    callbackPage(res, { success: false, message: 'Missing OAuth state' });
    return;
  }

  try {
    const { config, stores, fetchFn } = getIdentityRuntime();

    // Claim FIRST: a replayed callback must lose before any code exchange can happen.
    const claim = await stores.authStates.claim(state);
    if (claim.outcome !== 'claimed') {
      throw new CustomError(
        400,
        claim.outcome === 'expired'
          ? 'This connection attempt expired; start again'
          : 'This connection attempt is invalid or was already used'
      );
    }

    const oauthError = queryString(req.query.error);
    if (oauthError) {
      const description = queryString(req.query.error_description);
      throw new CustomError(
        400,
        description || `Authorization server returned ${oauthError}`
      );
    }
    const code = queryString(req.query.code);
    if (!code) throw new CustomError(400, 'Missing OAuth authorization code');

    const attempt = claim.record;
    const binding = await stores.binding.get();
    if (
      !binding ||
      !sameRevision(binding.connectedAt, attempt.bindingConnectedAt)
    ) {
      throw new CustomError(
        409,
        'The identity MCP binding changed while authorization was in progress'
      );
    }

    const provider = createIdentityMcpAuthProvider({
      config,
      binding,
      userId: attempt.userId,
      mode: 'callback',
      loadedState: attempt,
      stores,
    });
    const result = await auth(provider, {
      serverUrl: binding.url,
      authorizationCode: code,
      callbackState: state,
      callbackIssuer: queryString(req.query.iss),
      scope: identityScope(config.ctp.projectKey, binding.serverKey),
      fetchFn,
    });
    if (result !== 'AUTHORIZED') {
      throw new Error(`Unexpected OAuth callback result: ${result}`);
    }

    await invalidateToolSetsForUser(attempt.userId);
    callbackPage(res, { success: true, message: 'Connected' });
  } catch (error) {
    logger.warn(
      `${LOG_PREFIX} callback failed: ${
        error instanceof Error
          ? `${error.name}: ${error.message}`.slice(0, 300)
          : 'unknown error'
      }`
    );
    callbackPage(res, {
      success: false,
      // Only messages written in this file reach the page; anything else may carry internals.
      message:
        error instanceof CustomError ? error.message : 'Connection failed',
    });
  }
};
