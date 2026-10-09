/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../../src/config';
import { encryptJson } from '../../src/crypto/envelope';
import { createIdentityStores } from '../../src/identity-mcp/adapters/persistence';
import type { IdentityStores } from '../../src/identity-mcp/ports';
import { IDENTITY_CLIENT_AAD } from '../../src/persistence/maintenance';
import type {
  IdentityBinding,
  TokenRecord,
} from '../../src/identity-mcp/types';
import { createPersistence, type Persistence } from '../../src/persistence';
import { MemoryObjectGateway } from '../../src/persistence/gateway/memory.gateway';
import type { ObjectGateway } from '../../src/persistence/gateway/types';
import { freshConfig } from '../helpers/env';

export const REGION = 'us-central1.gcp';
export const PROJECT_KEY = 'p';
export const SERVER_KEY = 'ai-assistant-identity';
export const USER_ID = 'user-1';
export const AUDIENCE = 'https://router.example';
export const CALLBACK = `${AUDIENCE}/service/managed-mcp-identity/callback`;
export const MCP_URL = `https://mcp.${REGION}.commercetools.com/projects/${PROJECT_KEY}/${SERVER_KEY}`;
export const AS_ORIGIN = `https://auth2.${REGION}.commercetools.com`;
export const TOKEN_ENDPOINT = `${AS_ORIGIN}/oauth2/token`;
export const SCOPE = `openid offline_access mcp:${PROJECT_KEY}:${SERVER_KEY}`;
export const CONNECTED_AT = 1_790_000_000_000;
export const TOKEN_CONTAINER = 'ai-assistant-identity-tokens';
export const AUTH_STATE_CONTAINER = 'ai-assistant-identity-auth-states';

export interface Rig {
  config: AppConfig;
  persistence: Persistence;
  stores: IdentityStores;
  mem: MemoryObjectGateway;
}

/** In-memory persistence plus the identity ports, with a valid configuration. */
export function makeRig(
  o: {
    env?: NodeJS.ProcessEnv;
    wrap?: (gw: MemoryObjectGateway) => ObjectGateway;
  } = {}
): Rig {
  const config = freshConfig({ MC_AUDIENCE: AUDIENCE, ...o.env });
  const mem = new MemoryObjectGateway();
  const persistence = createPersistence(config, {
    gateway: o.wrap ? o.wrap(mem) : mem,
  });
  return {
    config,
    persistence,
    stores: createIdentityStores(persistence),
    mem,
  };
}

/** What the SDK embedded in every record written before 2026-09-30. */
export const LEGACY_PIN = {
  issuer: `${AS_ORIGIN}/`,
  authorization_server: `${AS_ORIGIN}/`,
  token_endpoint: TOKEN_ENDPOINT,
};

export const bindingFixture = (
  extra: Partial<IdentityBinding> = {}
): IdentityBinding => ({
  serverKey: SERVER_KEY,
  url: MCP_URL,
  majorVersion: 'v4',
  authenticationMode: 'CommercetoolsIdentity',
  connectedAt: CONNECTED_AT,
  ...extra,
});

/** A client record shaped like the ones written before the issuer change. */
export const legacyClient = (): NonNullable<IdentityBinding['client']> => ({
  encryptedClient: encryptJson(
    'identity-client',
    { client_id: 'client-abc', client_secret: 'secret-abc', ...LEGACY_PIN },
    IDENTITY_CLIENT_AAD
  ),
  clientIdPrefix: 'client',
  redirectUri: CALLBACK,
  registeredScope: SCOPE,
  issuer: LEGACY_PIN.issuer,
  tokenEndpoint: TOKEN_ENDPOINT,
  registeredAt: CONNECTED_AT,
});

export const tokenRecordFixture = (
  extra: Partial<TokenRecord> = {},
  secrets: Record<string, unknown> = {}
): TokenRecord => ({
  userId: USER_ID,
  serverKey: SERVER_KEY,
  encryptedTokens: encryptJson(
    'identity-tokens',
    {
      access_token: 'expired-access',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'refresh-1',
      scope: SCOPE,
      ...LEGACY_PIN,
      ...secrets,
    },
    extra.userId ?? USER_ID
  ),
  accessTokenExpiresAt: Date.now() - 60_000,
  hasRefreshToken: true,
  scope: SCOPE,
  issuedAt: CONNECTED_AT + 1,
  updatedAt: CONNECTED_AT + 1,
  bindingConnectedAt: CONNECTED_AT,
  ...extra,
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export interface FakeAuth2 {
  fetchFn: typeof fetch;
  tokenRequests: URLSearchParams[];
  registrations: unknown[];
  revocations: URLSearchParams[];
}

/**
 * auth2 as it answers today (issuer without a trailing slash): protected-resource metadata,
 * AS metadata, registration, token and revocation endpoints.
 */
export function fakeAuth2(
  o: {
    tokenEndpoint?: string;
    asInPrm?: string;
    tokenStatus?: number;
    refreshToken?: string;
  } = {}
): FakeAuth2 {
  const tokenEndpoint = o.tokenEndpoint ?? TOKEN_ENDPOINT;
  const tokenRequests: URLSearchParams[] = [];
  const registrations: unknown[] = [];
  const revocations: URLSearchParams[] = [];

  const fetchFn = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return json({
        resource: MCP_URL,
        authorization_servers: [o.asInPrm ?? AS_ORIGIN],
      });
    }
    if (
      url.origin === AS_ORIGIN &&
      url.pathname.startsWith('/.well-known/oauth-authorization-server')
    ) {
      return json({
        issuer: AS_ORIGIN,
        authorization_endpoint: `${AS_ORIGIN}/oauth2/auth`,
        token_endpoint: tokenEndpoint,
        registration_endpoint: `${AS_ORIGIN}/oauth2/register`,
        revocation_endpoint: `${AS_ORIGIN}/oauth2/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
          'none',
        ],
      });
    }
    if (
      url.href === `${AS_ORIGIN}/oauth2/register` &&
      init?.method === 'POST'
    ) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (!Array.isArray(body.redirect_uris)) {
        return json({ error: 'invalid_client_metadata' }, 400);
      }
      registrations.push(body);
      return json(
        {
          client_id: `registered-client-${registrations.length}`,
          client_id_issued_at: 1,
          redirect_uris: body.redirect_uris,
          token_endpoint_auth_method: 'none',
        },
        201
      );
    }
    if (url.href === tokenEndpoint && init?.method === 'POST') {
      tokenRequests.push(new URLSearchParams(String(init.body)));
      if (o.tokenStatus && o.tokenStatus !== 200) {
        return json({ error: 'invalid_grant' }, o.tokenStatus);
      }
      return json({
        access_token: 'fresh-access',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: o.refreshToken ?? 'refresh-2',
        scope: SCOPE,
      });
    }
    if (url.href === `${AS_ORIGIN}/oauth2/revoke` && init?.method === 'POST') {
      revocations.push(new URLSearchParams(String(init.body)));
      return new Response('', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  return {
    fetchFn: fetchFn as typeof fetch,
    tokenRequests,
    registrations,
    revocations,
  };
}
