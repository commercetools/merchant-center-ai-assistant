/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { z } from 'zod';
import type { ProviderName, ProviderStatus } from '../config/provider-status';
import { assertPublicHttpsUrl } from './ssrf';
import {
  CONTENTSTACK_REGIONS,
  OPTIONAL_KEYS,
  RawProviderKeys,
  REQUIRED_KEYS,
} from './types';

/**
 * Format rules for the provider deployment keys. A rule failure is reported by KEY NAME
 * only: zod messages and inputs are never read, because they may echo the value.
 */
export const contentstackEnv = z.object({
  CONTENTSTACK_API_KEY: z.string().min(1),
  CONTENTSTACK_MANAGEMENT_TOKEN: z.string().min(1),
  CONTENTSTACK_BRANCH: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .optional(),
  CONTENTSTACK_REGION: z.enum(CONTENTSTACK_REGIONS).default('na'),
});

export const stripeEnv = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/),
  STRIPE_CONNECTED_ACCOUNT_ID: z
    .string()
    .regex(/^acct_[A-Za-z0-9]+$/)
    .optional(),
});

export const algoliaEnv = z.object({
  ALGOLIA_MCP_URL: z.string().superRefine((value, ctx) => {
    try {
      assertPublicHttpsUrl(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid' });
    }
  }),
});

const SCHEMAS: Record<ProviderName, z.ZodType> = {
  contentstack: contentstackEnv,
  algolia: algoliaEnv,
  stripe: stripeEnv,
};

export type ProviderValidation =
  | { ok: true }
  | { ok: false; invalidKeys: string[] };

const knownKeys = (provider: ProviderName): string[] => [
  ...REQUIRED_KEYS[provider],
  ...OPTIONAL_KEYS[provider],
];

/** Validates the (already trimmed, blank = undefined) keys of one provider. */
export const validateProvider = (
  provider: ProviderName,
  rawKeys: RawProviderKeys
): ProviderValidation => {
  const input: Record<string, string> = {};
  for (const key of knownKeys(provider)) {
    const value = rawKeys[key];
    if (value !== undefined) input[key] = value;
  }
  const result = SCHEMAS[provider].safeParse(input);
  if (result.success) return { ok: true };
  const known = new Set(knownKeys(provider));
  const invalid = new Set<string>();
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    if (known.has(key)) invalid.add(key);
  }
  return { ok: false, invalidKeys: [...invalid] };
};

export interface ProviderEvaluation {
  status: ProviderStatus;
  /** Key names only. */
  warning?: string;
}

/**
 * The single enablement rule (spec mcp-provider-configs): enabled iff every required key
 * is set AND every set key is valid. Used by the config section (startup) and by the
 * post-deploy report so both always agree.
 *
 * `configured` = every required key is set; `missingKeys` = required keys that are unset
 * or invalid, plus invalid optional keys (names only).
 */
export const evaluateProvider = (
  provider: ProviderName,
  rawKeys: RawProviderKeys
): ProviderEvaluation => {
  const required = REQUIRED_KEYS[provider];
  const unset = required.filter((k) => rawKeys[k] === undefined);
  const configured = unset.length === 0;
  const anySet = unset.length < required.length;

  if (!configured) {
    const status: ProviderStatus = {
      provider,
      configured: false,
      enabled: false,
      missingKeys: [...unset],
    };
    return anySet
      ? {
          status,
          warning: `PROVIDER ${provider} disabled: missing ${unset.join(', ')}`,
        }
      : { status };
  }

  const validation = validateProvider(provider, rawKeys);
  if (validation.ok) {
    return {
      status: { provider, configured: true, enabled: true, missingKeys: [] },
    };
  }
  return {
    status: {
      provider,
      configured: true,
      enabled: false,
      missingKeys: validation.invalidKeys,
    },
    warning: `PROVIDER ${provider} disabled: invalid ${validation.invalidKeys.join(', ')}`,
  };
};
