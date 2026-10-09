/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../config';
import { decryptJson } from '../crypto/envelope';
import { IDENTITY_CLIENT_AAD } from '../persistence/maintenance';
import { logger } from '../utils/logger.utils';
import { SHORT_FETCH_TIMEOUT_MS } from './constants';
import { auth2Url } from './region';
import type {
  IdentityBinding,
  IdentityMcpClientSecrets,
  IdentityMcpTokenSecrets,
  TokenRecord,
} from './types';

type FetchFn = typeof fetch;

/**
 * Revoke one refresh token at the authorization server (RFC 7009). Best effort: any failure
 * is logged (`REVOKE_FAILED`, never the token) and swallowed, and the call never waits longer
 * than 5 seconds per request. The token is only ever sent to the region's own auth2 origin.
 */
export async function revokeRefreshToken(opts: {
  apiRegion: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  fetchFn?: FetchFn;
}): Promise<void> {
  const doFetch = opts.fetchFn ?? fetch;
  const base = auth2Url(opts.apiRegion);
  try {
    const metadataResponse = await doFetch(
      `${base}/.well-known/oauth-authorization-server`,
      {
        redirect: 'manual',
        signal: AbortSignal.timeout(SHORT_FETCH_TIMEOUT_MS),
      }
    );
    if (!metadataResponse.ok)
      throw new Error(`metadata ${metadataResponse.status}`);
    const metadata = (await metadataResponse.json()) as {
      revocation_endpoint?: unknown;
    };
    if (typeof metadata.revocation_endpoint !== 'string') {
      throw new Error('no revocation_endpoint');
    }
    const endpoint = new URL(metadata.revocation_endpoint);
    if (endpoint.origin !== new URL(base).origin) {
      throw new Error(
        'revocation_endpoint is not on the authorization server origin'
      );
    }

    const body = new URLSearchParams({
      token: opts.refreshToken,
      token_type_hint: 'refresh_token',
      client_id: opts.clientId,
    });
    if (opts.clientSecret) body.set('client_secret', opts.clientSecret);

    const response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(SHORT_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`revocation ${response.status}`);
  } catch (error) {
    logger.warn(
      `[mcp-identity] REVOKE_FAILED ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Decrypts the stored refresh token of `record` and revokes it. Does nothing (and never
 * throws) when there is no refresh token, no stored client, or the data is unreadable.
 */
export async function revokeStoredTokens(
  config: Pick<AppConfig, 'ctp'>,
  binding: IdentityBinding,
  record: TokenRecord,
  fetchFn?: FetchFn
): Promise<void> {
  if (!record.hasRefreshToken || !binding.client) return;
  try {
    const tokens = decryptJson<IdentityMcpTokenSecrets>(
      'identity-tokens',
      record.encryptedTokens,
      record.userId
    );
    const client = decryptJson<IdentityMcpClientSecrets>(
      'identity-client',
      binding.client.encryptedClient,
      IDENTITY_CLIENT_AAD
    );
    if (!tokens.refresh_token) return;
    await revokeRefreshToken({
      apiRegion: config.ctp.region,
      clientId: client.client_id,
      clientSecret: client.client_secret,
      refreshToken: tokens.refresh_token,
      fetchFn,
    });
  } catch {
    logger.warn('[mcp-identity] REVOKE_FAILED stored credentials unreadable');
  }
}
