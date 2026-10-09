/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// OWNED BY SPEC D - replace body, keep the exported type and the adminUserIds call.
import { parseAdminUserIds } from '../admin-user-ids';
import { bool, str } from '../parse';
import { SectionParser } from '../types';

export interface AuthConfig {
  /** Optional at boot (change D fails closed per request when absent). */
  mcAudience?: string;
  /** Local development bypass; refused in production. */
  authDisabled: boolean;
  mcCloudIdentifier?: string;
  mcAppEntryPointUriPath?: string;
  /** Hint only: Connect documents CONNECT_SERVICE_URL for lifecycle scripts, not the running app. */
  connectServiceUrl?: string;
  adminUserIds: readonly string[];
}

export const parseAuth: SectionParser<AuthConfig> = (env, ctx) => {
  const errors: string[] = [];
  const authDisabled = bool(env, 'MC_AUTH_DISABLED', false, errors);
  if (authDisabled && ctx.nodeEnv === 'production') {
    errors.push('MC_AUTH_DISABLED: must not be true when NODE_ENV=production');
  }
  const admins = parseAdminUserIds(env.ADMIN_USER_IDS);
  errors.push(...admins.errors);
  return {
    errors,
    value: {
      mcAudience: str(env, 'MC_AUDIENCE'),
      authDisabled,
      mcCloudIdentifier: str(env, 'MC_CLOUD_IDENTIFIER'),
      mcAppEntryPointUriPath: str(env, 'MC_APP_ENTRY_POINT_URI_PATH'),
      connectServiceUrl: str(env, 'CONNECT_SERVICE_URL'),
      adminUserIds: admins.value,
    },
  };
};
