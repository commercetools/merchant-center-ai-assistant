/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ProviderName } from '../config/provider-status';

export type { ProviderName, ProviderStatus } from '../config/provider-status';

/** The providers configured through deployment configuration, in API order. */
export const PROVIDERS: readonly ProviderName[] = [
  'contentstack',
  'algolia',
  'stripe',
];

/** Deployment keys that must all be set for a provider to be enabled. */
export const REQUIRED_KEYS: Record<ProviderName, readonly string[]> = {
  contentstack: ['CONTENTSTACK_API_KEY', 'CONTENTSTACK_MANAGEMENT_TOKEN'],
  algolia: ['ALGOLIA_MCP_URL'],
  stripe: ['STRIPE_SECRET_KEY'],
};

/** Optional keys per provider (validated when set). */
export const OPTIONAL_KEYS: Record<ProviderName, readonly string[]> = {
  contentstack: ['CONTENTSTACK_BRANCH', 'CONTENTSTACK_REGION'],
  algolia: [],
  stripe: ['STRIPE_CONNECTED_ACCOUNT_ID'],
};

export const CONTENTSTACK_REGIONS = [
  'na',
  'eu',
  'au',
  'azure-na',
  'azure-eu',
  'gcp-na',
  'gcp-eu',
] as const;
export type ContentstackRegion = (typeof CONTENTSTACK_REGIONS)[number];

/** Raw deployment values of one provider; blank is already normalised to undefined. */
export type RawProviderKeys = Record<string, string | undefined>;
