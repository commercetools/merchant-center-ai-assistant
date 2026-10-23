/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { parseAdminUserIds } from '../../auth/admin';
import { bool, str } from '../parse';
import { McCloudIdentifier } from '../region';
import { SectionParser } from '../types';
import type { CtpConfig } from './ctp';

export interface AuthConfig {
  /** Origin of this service, from CONNECT_SERVICE_URL. Optional at boot: requests fail closed (401) without it. */
  mcAudience?: string;
  /** Local development bypass; refused in production. */
  authDisabled: boolean;
  /** Issuer of the gateway token. Default derives from CTP_REGION. */
  issuerCloudIdentifier: McCloudIdentifier;
  /** Chat Custom Application entry point (logging and checks only). */
  entryPointUriPath: string;
  /** Verified gateway user ids that are administrators. Compare only via isAdminUser. */
  adminUserIds: ReadonlySet<string>;
  /**
   * Feature flag: every verified user, not only administrators, may create, change and delete
   * the shared Managed MCP (identity) binding. Nothing else becomes administrator-only-free.
   */
  mcpBindingOpenToAll: boolean;
}

const ENTRY_PATH = /^[a-z0-9][a-z0-9_-]*$/;

function parseAudience(
  raw: string | undefined,
  nodeEnv: string,
  errors: string[]
): string | undefined {
  if (raw === undefined) return undefined;
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    url = undefined;
  }
  const schemeOk =
    url?.protocol === 'https:' ||
    (url?.protocol === 'http:' && nodeEnv !== 'production');
  if (
    !url ||
    !schemeOk ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    errors.push(
      'CONNECT_SERVICE_URL: must be an https URL (http only outside production)'
    );
    return undefined;
  }
  return url.origin;
}

function originOf(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

export const parseAuth: SectionParser<AuthConfig> = (env, ctx) => {
  const errors: string[] = [];

  // The audience of the Merchant Center token is the origin of the service's own public URL,
  // CONNECT_SERVICE_URL (it may end in /service). Locally you set it yourself, see .env.example.
  // A value that is not a URL is ignored and the service stays closed (401) without it.
  const mcAudience = parseAudience(originOf(str(env, 'CONNECT_SERVICE_URL')), ctx.nodeEnv, errors);

  const authDisabled = bool(env, 'MC_AUTH_DISABLED', false, errors);
  if (authDisabled && ctx.nodeEnv === 'production') {
    errors.push('MC_AUTH_DISABLED: must not be enabled in production');
  }

  const ctp = ctx.partial.ctp as CtpConfig | undefined;
  // The Merchant Center cloud follows the project's region (CTP_REGION).
  const issuerCloudIdentifier = ctp?.mcCloudIdentifier;

  const entryPointUriPath = str(env, 'MC_APP_ENTRY_POINT_URI_PATH') ?? 'ai-assistant';
  if (!ENTRY_PATH.test(entryPointUriPath)) {
    errors.push('MC_APP_ENTRY_POINT_URI_PATH: must match ^[a-z0-9][a-z0-9_-]*$');
  }

  const mcpBindingOpenToAll = bool(env, 'MCP_BINDING_OPEN_TO_ALL', false, errors);

  const admins = parseAdminUserIds(env.ADMIN_USER_IDS);
  errors.push(...admins.errors);

  if (errors.length > 0 || !issuerCloudIdentifier) {
    // Without a valid ctp section the issuer cannot be derived; ctp reports why.
    return { errors };
  }
  return {
    errors,
    value: {
      mcAudience,
      authDisabled,
      issuerCloudIdentifier,
      entryPointUriPath,
      adminUserIds: admins.value,
      mcpBindingOpenToAll,
    },
  };
};
