/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { SERVER_KEY_PATTERN } from '../../src/identity-mcp/constants';
import {
  callbackUrl,
  identityScope,
  identityToolsCacheKey,
  identityToolsPrefixForUser,
  isValidIdentityUserId,
  MissingAudienceError,
} from '../../src/identity-mcp/keys';
import {
  auth2Url,
  isCommercetoolsAuthHost,
  managedMcpUrl,
} from '../../src/identity-mcp/region';
import { freshConfig } from '../helpers/env';

const binding = (connectedAt = 1_000) => ({
  serverKey: 'ai-assistant',
  connectedAt,
});

describe('identity user id validation', () => {
  it('accepts a Merchant Center user id', () => {
    expect(isValidIdentityUserId('3mj76c04-f910-4223-84e1-f97b0fe291c2')).toBe(
      true
    );
    expect(isValidIdentityUserId('user_abc')).toBe(true);
  });

  it('rejects values that would corrupt a cache key or a log line', () => {
    for (const hostile of [
      undefined,
      null,
      '',
      'has space',
      'a:b',
      'a/b',
      'a.b',
      'a'.repeat(65),
      '-lead',
    ]) {
      expect(isValidIdentityUserId(hostile)).toBe(false);
    }
  });
});

describe('tool-set cache keys', () => {
  it('two users on the same binding get different keys', () => {
    expect(identityToolsCacheKey('user-a', binding())).not.toBe(
      identityToolsCacheKey('user-b', binding())
    );
  });

  it('is stable for the same user and revision, and changes with the revision', () => {
    expect(identityToolsCacheKey('user-a', binding())).toBe(
      identityToolsCacheKey('user-a', binding())
    );
    expect(identityToolsCacheKey('user-a', binding())).not.toBe(
      identityToolsCacheKey('user-a', binding(2_000))
    );
  });

  it('has the documented shape', () => {
    expect(identityToolsCacheKey('user-a', binding(42))).toBe(
      'ctmcpid:user-a:42:ai-assistant'
    );
  });

  it('a missing userId throws instead of producing a shared "undefined" key', () => {
    expect(() =>
      identityToolsCacheKey(undefined as unknown as string, binding())
    ).toThrow(/requires a userId/);
    expect(() => identityToolsCacheKey('', binding())).toThrow(
      /requires a userId/
    );
  });

  it('a per-user sweep matches only that user (not a user with the same prefix)', () => {
    const prefix = identityToolsPrefixForUser('user-a');
    expect(identityToolsCacheKey('user-a', binding()).startsWith(prefix)).toBe(
      true
    );
    expect(identityToolsCacheKey('user-b', binding()).startsWith(prefix)).toBe(
      false
    );
    expect(identityToolsCacheKey('user-ab', binding()).startsWith(prefix)).toBe(
      false
    );
  });
});

describe('server key and scope', () => {
  it('SERVER_KEY_PATTERN rejects URLs and short keys', () => {
    expect(SERVER_KEY_PATTERN.test('ai-assistant')).toBe(true);
    expect(SERVER_KEY_PATTERN.test('a')).toBe(false);
    expect(SERVER_KEY_PATTERN.test('https://x')).toBe(false);
    expect(SERVER_KEY_PATTERN.test('a'.repeat(257))).toBe(false);
  });

  it('identityScope', () => {
    expect(identityScope('proj', 'srv')).toBe(
      'openid offline_access mcp:proj:srv'
    );
  });
});

describe('region helpers', () => {
  it('builds the documented URLs', () => {
    expect(managedMcpUrl('us-central1.gcp', 'p', 's')).toBe(
      'https://mcp.us-central1.gcp.commercetools.com/projects/p/s'
    );
    expect(auth2Url('europe-west1.gcp')).toBe(
      'https://auth2.europe-west1.gcp.commercetools.com'
    );
  });

  it('recognises commercetools auth hosts only', () => {
    expect(
      isCommercetoolsAuthHost('auth2.us-central1.gcp.commercetools.com')
    ).toBe(true);
    expect(
      isCommercetoolsAuthHost('auth.us-central1.gcp.commercetools.com')
    ).toBe(true);
    expect(isCommercetoolsAuthHost('auth.identity.commercetools.com')).toBe(
      true
    );
    expect(
      isCommercetoolsAuthHost(
        'auth2.us-central1.gcp.commercetools.com.evil.example'
      )
    ).toBe(false);
    expect(isCommercetoolsAuthHost('evil.example')).toBe(false);
  });
});

describe('callbackUrl', () => {
  // Config validation only admits an origin; the helper must still cope with a full URL.
  const urlFor = (audience?: string) =>
    callbackUrl({ auth: { ...freshConfig().auth, mcAudience: audience } });

  it('uses the origin only (origin form, with a path, with a trailing slash)', () => {
    const expected =
      'https://service-abc.europe-west1.gcp.commercetools.app/service/managed-mcp-identity/callback';
    expect(
      urlFor('https://service-abc.europe-west1.gcp.commercetools.app')
    ).toBe(expected);
    expect(
      urlFor('https://service-abc.europe-west1.gcp.commercetools.app/service')
    ).toBe(expected);
    expect(
      urlFor('https://service-abc.europe-west1.gcp.commercetools.app/')
    ).toBe(expected);
  });

  it('throws a typed error when CONNECT_SERVICE_URL is not configured', () => {
    expect(() => urlFor()).toThrow(MissingAudienceError);
  });
});
