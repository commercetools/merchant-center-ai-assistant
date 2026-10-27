/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Secret } from './secret';

export type ProviderName = 'contentstack' | 'algolia' | 'stripe';

export interface ProviderStatus {
  provider: ProviderName;
  configured: boolean;
  enabled: boolean;
  missingKeys: string[];
}

export interface ProvidersConfig {
  contentstack?: {
    apiKey: Secret<string>;
    managementToken: Secret<string>;
    branch?: string;
    region: string;
  };
  algolia?: { url: Secret<string> };
  stripe?: { secretKey: Secret<string>; connectedAccountId?: string };
  status: ProviderStatus[];
  /** Key names only, never values. */
  warnings: string[];
}

/**
 * Presence-only status for one provider (format validation is `evaluateProvider` in
 * `mcp-providers/schemas.ts`).
 */
export function providerStatus(
  provider: ProviderName,
  required: Record<string, string | undefined>
): { status: ProviderStatus; warning?: string } {
  const keys = Object.keys(required);
  const missingKeys = keys.filter((k) => required[k] === undefined);
  const configured = missingKeys.length < keys.length;
  const enabled = missingKeys.length === 0;
  const status: ProviderStatus = { provider, configured, enabled, missingKeys };
  if (configured && !enabled) {
    return {
      status,
      warning: `PROVIDER ${provider} disabled: missing ${missingKeys.join(', ')}`,
    };
  }
  return { status };
}
