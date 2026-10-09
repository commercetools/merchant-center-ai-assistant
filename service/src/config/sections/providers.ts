/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Secret } from '../secret';
import { str } from '../parse';
import {
  ProvidersConfig,
  ProviderStatus,
  providerStatus,
} from '../provider-status';
import { SectionParser } from '../types';

/**
 * Presence-only logic. Change J replaces the validators (formats, Contentstack
 * region, Algolia URL guard) inside this file and keeps the exported types.
 * Providers are optional: this parser never adds errors.
 */
export const parseProviders: SectionParser<ProvidersConfig> = (env) => {
  const csKey = str(env, 'CONTENTSTACK_API_KEY');
  const csToken = str(env, 'CONTENTSTACK_MANAGEMENT_TOKEN');
  const algolia = str(env, 'ALGOLIA_MCP_URL');
  const stripe = str(env, 'STRIPE_SECRET_KEY');

  const checks = [
    providerStatus('contentstack', {
      CONTENTSTACK_API_KEY: csKey,
      CONTENTSTACK_MANAGEMENT_TOKEN: csToken,
    }),
    providerStatus('algolia', { ALGOLIA_MCP_URL: algolia }),
    providerStatus('stripe', { STRIPE_SECRET_KEY: stripe }),
  ];
  const status: ProviderStatus[] = checks.map((c) => c.status);
  const warnings = checks.flatMap((c) => (c.warning ? [c.warning] : []));
  const enabled = (name: string) =>
    status.find((s) => s.provider === name)?.enabled === true;

  const value: ProvidersConfig = { status, warnings };
  if (enabled('contentstack') && csKey && csToken) {
    value.contentstack = {
      apiKey: new Secret(csKey),
      managementToken: new Secret(csToken),
      branch: str(env, 'CONTENTSTACK_BRANCH'),
      region: str(env, 'CONTENTSTACK_REGION') ?? 'na',
    };
  }
  if (enabled('algolia') && algolia) {
    value.algolia = { url: new Secret(algolia) };
  }
  if (enabled('stripe') && stripe) {
    value.stripe = {
      secretKey: new Secret(stripe),
      connectedAccountId: str(env, 'STRIPE_CONNECTED_ACCOUNT_ID'),
    };
  }
  return { value, errors: [] };
};
