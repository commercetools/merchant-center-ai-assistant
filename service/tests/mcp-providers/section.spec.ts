/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

const statusOf = (c: ReturnType<typeof freshConfig>, name: string) =>
  c.providers.status.find((s) => s.provider === name);

describe('providers section (validation)', () => {
  it('a valid full set enables all three', () => {
    const c = freshConfig({
      CONTENTSTACK_API_KEY: 'k',
      CONTENTSTACK_MANAGEMENT_TOKEN: 't',
      CONTENTSTACK_REGION: 'eu',
      ALGOLIA_MCP_URL: 'https://mcp.algolia.com/x',
      STRIPE_SECRET_KEY: 'sk_test_abc',
    });
    expect(c.providers.status.every((s) => s.enabled)).toBe(true);
    expect(c.providers.contentstack?.region).toBe('eu');
    expect(c.providers.warnings).toEqual([]);
  });

  it('a partial set is disabled with missingKeys', () => {
    const c = freshConfig({ CONTENTSTACK_MANAGEMENT_TOKEN: 't' });
    expect(statusOf(c, 'contentstack')).toEqual({
      provider: 'contentstack',
      configured: false,
      enabled: false,
      missingKeys: ['CONTENTSTACK_API_KEY'],
    });
    expect(c.providers.contentstack).toBeUndefined();
  });

  it('a private Algolia URL disables Algolia and the object is absent', () => {
    const c = freshConfig({ ALGOLIA_MCP_URL: 'https://169.254.169.254/x' });
    expect(statusOf(c, 'algolia')?.enabled).toBe(false);
    expect(c.providers.algolia).toBeUndefined();
    expect(c.providers.warnings).toEqual(['PROVIDER algolia disabled: invalid ALGOLIA_MCP_URL']);
  });

  it('an invalid Stripe key never appears in warnings and does not throw', () => {
    const c = freshConfig({ STRIPE_SECRET_KEY: 'SENTINEL-bad', CONTENTSTACK_REGION: 'SENTINEL-r' });
    expect(c.providers.stripe).toBeUndefined();
    expect(c.providers.warnings).toEqual(['PROVIDER stripe disabled: invalid STRIPE_SECRET_KEY']);
    expect(JSON.stringify(c.providers)).not.toContain('SENTINEL');
  });

  it('an invalid optional key (region) disables Contentstack, warning names the key', () => {
    const c = freshConfig({
      CONTENTSTACK_API_KEY: 'k',
      CONTENTSTACK_MANAGEMENT_TOKEN: 't',
      CONTENTSTACK_REGION: 'mars',
    });
    expect(c.providers.contentstack).toBeUndefined();
    expect(c.providers.warnings).toEqual([
      'PROVIDER contentstack disabled: invalid CONTENTSTACK_REGION',
    ]);
  });

  it('no provider key makes readConfiguration throw', () => {
    expect(() =>
      freshConfig({
        CONTENTSTACK_API_KEY: '%%',
        ALGOLIA_MCP_URL: '::',
        STRIPE_SECRET_KEY: '\u0000',
        STRIPE_CONNECTED_ACCOUNT_ID: 'x',
      })
    ).not.toThrow();
  });
});
