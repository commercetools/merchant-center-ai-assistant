/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { evaluateProvider } from '../../mcp-providers/schemas';
import { PROVIDERS } from '../../mcp-providers/types';
import { str } from '../parse';
import { ProvidersConfig } from '../provider-status';
import { Secret } from '../secret';
import { SectionParser } from '../types';

const PROVIDER_KEYS = [
  'CONTENTSTACK_API_KEY',
  'CONTENTSTACK_MANAGEMENT_TOKEN',
  'CONTENTSTACK_BRANCH',
  'CONTENTSTACK_REGION',
  'ALGOLIA_MCP_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_CONNECTED_ACCOUNT_ID',
] as const;

/**
 * Provider enablement: a provider is enabled iff all required keys are set and
 * every set key is valid. A partial or invalid set disables the provider with a warning that
 * names keys only; it never adds an error, so a typo cannot stop the service. No network.
 */
export const parseProviders: SectionParser<ProvidersConfig> = (env) => {
  const raw: Record<string, string | undefined> = {};
  for (const key of PROVIDER_KEYS) raw[key] = str(env, key);

  const checks = PROVIDERS.map((p) => evaluateProvider(p, raw));
  const status = checks.map((c) => c.status);
  const warnings = checks.flatMap((c) => (c.warning ? [c.warning] : []));
  const enabled = (name: string) =>
    status.find((s) => s.provider === name)?.enabled === true;

  const value: ProvidersConfig = { status, warnings };
  const csKey = raw.CONTENTSTACK_API_KEY;
  const csToken = raw.CONTENTSTACK_MANAGEMENT_TOKEN;
  if (enabled('contentstack') && csKey && csToken) {
    value.contentstack = {
      apiKey: new Secret(csKey),
      managementToken: new Secret(csToken),
      branch: raw.CONTENTSTACK_BRANCH,
      region: raw.CONTENTSTACK_REGION ?? 'na',
    };
  }
  if (enabled('algolia') && raw.ALGOLIA_MCP_URL) {
    value.algolia = { url: new Secret(raw.ALGOLIA_MCP_URL) };
  }
  if (enabled('stripe') && raw.STRIPE_SECRET_KEY) {
    value.stripe = {
      secretKey: new Secret(raw.STRIPE_SECRET_KEY),
      connectedAccountId: raw.STRIPE_CONNECTED_ACCOUNT_ID,
    };
  }
  return { value, errors: [] };
};
