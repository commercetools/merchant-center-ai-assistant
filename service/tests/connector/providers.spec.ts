/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { checkAudience } from '../../src/connector/checks/audience';
import { reportProviders } from '../../src/connector/checks/providers';

describe('reportProviders', () => {
  it('providers: none configured lists missing keys', () => {
    const { ok, lines } = reportProviders({});
    expect(ok).toBe(true);
    expect(lines).toEqual([
      'post-deploy: providers contentstack: not configured (missing: CONTENTSTACK_API_KEY, CONTENTSTACK_MANAGEMENT_TOKEN)',
      'post-deploy: providers algolia: not configured (missing: ALGOLIA_MCP_URL)',
      'post-deploy: providers stripe: not configured (missing: STRIPE_SECRET_KEY)',
    ]);
  });

  it('providers: stripe configured', () => {
    const { lines } = reportProviders({ STRIPE_SECRET_KEY: 'sk_test_SENTINEL' });
    expect(lines).toContain('post-deploy: providers stripe: configured');
  });

  it('providers: a partial contentstack set names only the missing key', () => {
    const { lines } = reportProviders({ CONTENTSTACK_API_KEY: 'k1' });
    expect(lines[0]).toBe(
      'post-deploy: providers contentstack: not configured (missing: CONTENTSTACK_MANAGEMENT_TOKEN)'
    );
  });

  it('providers: sentinel values never logged', () => {
    const { lines } = reportProviders({
      STRIPE_SECRET_KEY: 'sk_test_SENTINEL',
      CONTENTSTACK_API_KEY: 'SENTINEL-api',
      CONTENTSTACK_MANAGEMENT_TOKEN: 'SENTINEL-token',
      ALGOLIA_MCP_URL: 'https://SENTINEL.example.com/mcp?key=SENTINEL',
      CONTENTSTACK_REGION: 'eu',
    });
    expect(lines.join('\n')).not.toContain('SENTINEL');
    expect(lines.every((l) => l.endsWith(': configured'))).toBe(true);
  });

  it('providers: invalid stripe key reported as missing', () => {
    // A key that fails the service's own validation does not count as configured: the provider
    // is reported as not configured and only the key NAME is printed (as "invalid", never the value).
    const { ok, lines } = reportProviders({ STRIPE_SECRET_KEY: 'pk_test_SENTINEL-not-a-secret-key' });
    expect(ok).toBe(true);
    const stripe = lines.find((l) => l.includes('providers stripe:'));
    expect(stripe).toBe('post-deploy: providers stripe: not configured (invalid: STRIPE_SECRET_KEY)');
    expect(lines.join('\n')).not.toContain('SENTINEL');
  });

  it('providers: an invalid value is reported by key name, never by value', () => {
    const { lines } = reportProviders({
      STRIPE_SECRET_KEY: 'hello-SENTINEL',
      ALGOLIA_MCP_URL: 'https://169.254.169.254/SENTINEL',
    });
    expect(lines).toContain(
      'post-deploy: providers stripe: not configured (invalid: STRIPE_SECRET_KEY)'
    );
    expect(lines).toContain(
      'post-deploy: providers algolia: not configured (invalid: ALGOLIA_MCP_URL)'
    );
    expect(lines.join('\n')).not.toContain('SENTINEL');
  });
});

describe('checkAudience', () => {
  const SERVICE = 'https://service-abc.us-central1.gcp.commercetools.app/service';

  it('audience: matching origins pass and the origin is logged', () => {
    const result = checkAudience({
      mcAudience: 'https://service-abc.us-central1.gcp.commercetools.app',
      serviceUrl: SERVICE,
    });
    expect(result.ok).toBe(true);
    expect(result.lines).toContain(
      'post-deploy: service origin https://service-abc.us-central1.gcp.commercetools.app'
    );
  });

  it('audience: mismatch fails and states both origins', () => {
    const result = checkAudience({ mcAudience: 'https://other.example', serviceUrl: SERVICE });
    expect(result.ok).toBe(false);
    expect(result.failure).toContain('https://other.example');
    expect(result.failure).toContain('https://service-abc.us-central1.gcp.commercetools.app');
  });

  it('audience: unset logs the exact value to configure', () => {
    const result = checkAudience({ serviceUrl: SERVICE });
    expect(result.ok).toBe(true);
    expect(result.lines).toContain(
      'post-deploy: MC_AUDIENCE is not set. Set it to https://service-abc.us-central1.gcp.commercetools.app (redeploy: finalize)'
    );
  });

  it('audience: an invalid value fails', () => {
    expect(checkAudience({ mcAudience: 'not a url', serviceUrl: SERVICE }).ok).toBe(false);
  });
});
