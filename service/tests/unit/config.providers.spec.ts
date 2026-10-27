/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';
import { fakeKeyBase64 } from '../helpers/gcp';

beforeEach(() => resetConfigurationForTests());

describe('providers section', () => {
  it('disables all three when nothing is set, without warnings', () => {
    const { providers } = freshConfig();
    expect(providers.status.map((s) => [s.provider, s.enabled])).toEqual([
      ['contentstack', false],
      ['algolia', false],
      ['stripe', false],
    ]);
    expect(providers.status.every((s) => !s.configured)).toBe(true);
    expect(providers.warnings).toEqual([]);
    expect(providers.stripe).toBeUndefined();
  });

  it('enables Stripe with its secret key only', () => {
    const { providers } = freshConfig({
      STRIPE_SECRET_KEY: 'sk_test_value1',
      STRIPE_CONNECTED_ACCOUNT_ID: 'acct_1',
    });
    expect(providers.status.find((s) => s.provider === 'stripe')).toEqual({
      provider: 'stripe',
      configured: true,
      enabled: true,
      missingKeys: [],
    });
    expect(providers.stripe?.connectedAccountId).toBe('acct_1');
    expect(providers.stripe?.secretKey.reveal()).toBe('sk_test_value1');
  });

  it('disables a partial Contentstack set with a warning naming the key', () => {
    const { providers } = freshConfig({ CONTENTSTACK_API_KEY: 'cs-key-value' });
    const cs = providers.status.find((s) => s.provider === 'contentstack');
    expect(cs?.enabled).toBe(false);
    expect(cs?.configured).toBe(false);
    expect(cs?.missingKeys).toEqual(['CONTENTSTACK_MANAGEMENT_TOKEN']);
    expect(providers.warnings).toEqual([
      'PROVIDER contentstack disabled: missing CONTENTSTACK_MANAGEMENT_TOKEN',
    ]);
    expect(providers.warnings.join()).not.toContain('cs-key-value');
    expect(providers.contentstack).toBeUndefined();
  });

  it('enables Contentstack with both keys and defaults the region to na', () => {
    const { providers } = freshConfig({
      CONTENTSTACK_API_KEY: 'a',
      CONTENTSTACK_MANAGEMENT_TOKEN: 'b',
      CONTENTSTACK_BRANCH: ' dev ',
    });
    expect(providers.contentstack?.region).toBe('na');
    expect(providers.contentstack?.branch).toBe('dev');
  });

  it('treats blank values as unset', () => {
    const { providers } = freshConfig({ ALGOLIA_MCP_URL: '   ' });
    expect(providers.algolia).toBeUndefined();
    expect(providers.warnings).toEqual([]);
  });

  it('serialises every secret field as [secret]', () => {
    const sa = fakeKeyBase64();
    const c = freshConfig({
      CONTENTSTACK_API_KEY: 'val-cs-api',
      CONTENTSTACK_MANAGEMENT_TOKEN: 'val-cs-token',
      ALGOLIA_MCP_URL: 'https://val-algolia.example.test/?key=abc',
      STRIPE_SECRET_KEY: 'sk_test_valstripe',
      GCP_SA_KEY_BASE64: sa,
      ENCRYPTION_KEY: 'dmFsLWVuYy12YWwtZW5jLXZhbC1lbmMtdmFsLWVuYyE=',
    });
    const json = JSON.stringify(c);
    expect((json.match(/\[secret\]/g) ?? []).length).toBeGreaterThanOrEqual(6);
    for (const v of ['val-cs-api', 'val-cs-token', 'val-algolia', 'sk_test_valstripe', sa, 'dmFsLWVuYy12YWwtZW5j']) {
      expect(json).not.toContain(v);
    }
  });
});
