/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ProviderName, providerStatus } from '../../config/provider-status';
import type { ProviderEnv } from '../env';

/**
 * The same enablement rule as the service (presence of every required key). Change J adds
 * format validation inside the config section.
 * TODO(J): reuse J's REQUIRED_KEYS / validateProvider so an invalid value is reported as
 * missing, then add the test `providers: invalid stripe key reported as missing`.
 */
const REQUIRED: Record<ProviderName, readonly (keyof ProviderEnv)[]> = {
  contentstack: ['CONTENTSTACK_API_KEY', 'CONTENTSTACK_MANAGEMENT_TOKEN'],
  algolia: ['ALGOLIA_MCP_URL'],
  stripe: ['STRIPE_SECRET_KEY'],
};

/**
 * One line per provider. Names of provider and keys only: never a value, a length, a host or
 * a prefix. Informational: never fails the deployment.
 */
export function reportProviders(providerEnv: ProviderEnv): { ok: true; lines: string[] } {
  const lines = (Object.keys(REQUIRED) as ProviderName[]).map((provider) => {
    const required: Record<string, string | undefined> = {};
    for (const key of REQUIRED[provider]) required[key] = providerEnv[key];
    const { status } = providerStatus(provider, required);
    return status.enabled
      ? `post-deploy: providers ${provider}: configured`
      : `post-deploy: providers ${provider}: not configured (missing: ${status.missingKeys.join(', ')})`;
  });
  return { ok: true, lines };
}
