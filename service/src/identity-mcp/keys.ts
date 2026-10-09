/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../config';
import { IDENTITY_USER_ID_PATTERN, SERVICE_BASE_PATH } from './constants';
import type { IdentityBinding } from './types';

/** Thrown when `MC_AUDIENCE` is not configured (it is optional at boot). */
export class MissingAudienceError extends Error {
  constructor() {
    super(
      'MC_AUDIENCE is not configured, so the OAuth callback URL is unknown'
    );
    this.name = 'MissingAudienceError';
  }
}

export const isValidIdentityUserId = (value: unknown): value is string =>
  typeof value === 'string' && IDENTITY_USER_ID_PATTERN.test(value);

/**
 * Tool-set cache key. The user is in the key on purpose: a cached tool set is a live handle
 * on ONE user's commercetools identity. `connectedAt` is the binding revision.
 */
export const identityToolsCacheKey = (
  userId: string,
  binding: Pick<IdentityBinding, 'connectedAt' | 'serverKey'>
): string => {
  if (!userId) {
    throw new Error(
      'identityToolsCacheKey requires a userId: an empty id would collapse every user onto one entry'
    );
  }
  return `ctmcpid:${userId}:${binding.connectedAt}:${binding.serverKey}`;
};

/** Every cached tool-set key of one user. */
export const identityToolsPrefixForUser = (userId: string): string =>
  `ctmcpid:${userId}:`;

/** `origin(MC_AUDIENCE) + /service/managed-mcp-identity/callback`. */
export const callbackUrl = (cfg: Pick<AppConfig, 'auth'>): string => {
  const audience = cfg.auth.mcAudience;
  if (!audience) throw new MissingAudienceError();
  return `${new URL(audience).origin}${SERVICE_BASE_PATH}/managed-mcp-identity/callback`;
};

/** `openid offline_access mcp:{projectKey}:{serverKey}` */
export const identityScope = (projectKey: string, serverKey: string): string =>
  `openid offline_access mcp:${projectKey}:${serverKey}`;
