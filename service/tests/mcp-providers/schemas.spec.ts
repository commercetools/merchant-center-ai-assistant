/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  evaluateProvider,
  validateProvider,
} from '../../src/mcp-providers/schemas';

const SENTINEL = 'SENTINEL-rejected-value';

describe('validateProvider', () => {
  it('accepts valid examples for each provider', () => {
    expect(
      validateProvider('stripe', {
        STRIPE_SECRET_KEY: 'sk_test_abc123',
        STRIPE_CONNECTED_ACCOUNT_ID: 'acct_1A2b',
      })
    ).toEqual({ ok: true });
    expect(
      validateProvider('stripe', { STRIPE_SECRET_KEY: 'rk_live_abc' })
    ).toEqual({ ok: true });
    expect(
      validateProvider('contentstack', {
        CONTENTSTACK_API_KEY: 'a',
        CONTENTSTACK_MANAGEMENT_TOKEN: 'b',
        CONTENTSTACK_BRANCH: 'release-1.2_x',
        CONTENTSTACK_REGION: 'azure-eu',
      })
    ).toEqual({ ok: true });
    expect(
      validateProvider('algolia', {
        ALGOLIA_MCP_URL: 'https://mcp.algolia.com/x?key=1',
      })
    ).toEqual({ ok: true });
  });

  it('rejects a bad Stripe key and names the key only', () => {
    const r = validateProvider('stripe', { STRIPE_SECRET_KEY: SENTINEL });
    expect(r).toEqual({ ok: false, invalidKeys: ['STRIPE_SECRET_KEY'] });
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it('rejects a bad connected account id', () => {
    expect(
      validateProvider('stripe', {
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_CONNECTED_ACCOUNT_ID: SENTINEL,
      })
    ).toEqual({ ok: false, invalidKeys: ['STRIPE_CONNECTED_ACCOUNT_ID'] });
  });

  it('rejects an unknown Contentstack region and a bad branch', () => {
    const r = validateProvider('contentstack', {
      CONTENTSTACK_API_KEY: 'a',
      CONTENTSTACK_MANAGEMENT_TOKEN: 'b',
      CONTENTSTACK_REGION: SENTINEL,
      CONTENTSTACK_BRANCH: 'has space',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect([...r.invalidKeys].sort()).toEqual([
        'CONTENTSTACK_BRANCH',
        'CONTENTSTACK_REGION',
      ]);
    }
  });

  it('rejects non-https and private Algolia URLs', () => {
    for (const url of [
      'http://mcp.algolia.com/x',
      'https://169.254.169.254/x',
      SENTINEL,
    ]) {
      expect(validateProvider('algolia', { ALGOLIA_MCP_URL: url })).toEqual({
        ok: false,
        invalidKeys: ['ALGOLIA_MCP_URL'],
      });
    }
  });
});

describe('evaluateProvider', () => {
  it('nothing set: not configured, no warning', () => {
    expect(evaluateProvider('stripe', {})).toEqual({
      status: {
        provider: 'stripe',
        configured: false,
        enabled: false,
        missingKeys: ['STRIPE_SECRET_KEY'],
      },
    });
  });

  it('partial Contentstack: disabled, warning names the missing key', () => {
    const r = evaluateProvider('contentstack', {
      CONTENTSTACK_API_KEY: SENTINEL,
    });
    expect(r.status).toEqual({
      provider: 'contentstack',
      configured: false,
      enabled: false,
      missingKeys: ['CONTENTSTACK_MANAGEMENT_TOKEN'],
    });
    expect(r.warning).toBe(
      'PROVIDER contentstack disabled: missing CONTENTSTACK_MANAGEMENT_TOKEN'
    );
    expect(r.warning).not.toContain(SENTINEL);
  });

  it('invalid value: configured but disabled, warning never echoes the value', () => {
    const r = evaluateProvider('stripe', { STRIPE_SECRET_KEY: SENTINEL });
    expect(r.status).toEqual({
      provider: 'stripe',
      configured: true,
      enabled: false,
      missingKeys: ['STRIPE_SECRET_KEY'],
    });
    expect(r.warning).toBe(
      'PROVIDER stripe disabled: invalid STRIPE_SECRET_KEY'
    );
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
  });

  it('a valid set is enabled; the region defaults to na', () => {
    const r = evaluateProvider('contentstack', {
      CONTENTSTACK_API_KEY: 'a',
      CONTENTSTACK_MANAGEMENT_TOKEN: 'b',
    });
    expect(r.status.enabled).toBe(true);
    expect(r.warning).toBeUndefined();
  });
});
