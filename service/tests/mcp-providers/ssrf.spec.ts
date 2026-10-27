/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  assertPublicHttpsUrl,
  isPublicHttpsUrl,
} from '../../src/mcp-providers/ssrf';

describe('assertPublicHttpsUrl', () => {
  it.each([
    'https://169.254.169.254/x',
    'https://169.254.169.254/mcp',
    'https://[::1]/',
    'https://10.0.0.5',
    'https://10.255.255.255/a',
    'https://127.0.0.1/',
    'https://127.1.2.3/',
    'https://0.0.0.0/',
    'https://100.64.0.1/',
    'https://172.16.0.1/',
    'https://172.31.255.255/',
    'https://192.168.1.1/',
    'https://[fc00::1]/',
    'https://[fd12:3456::1]/',
    'https://[fe80::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:10.0.0.1]/',
    'https://localhost/x',
    'https://app.localhost/x',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://db.internal/x',
    'https://user:pw@mcp.algolia.com/x',
    'https://user@mcp.algolia.com/x',
    'http://mcp.algolia.com/x',
    'ftp://mcp.algolia.com/x',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(() => assertPublicHttpsUrl(url)).toThrow();
    expect(isPublicHttpsUrl(url)).toBe(false);
  });

  it('rejects decimal, hex and short IPv4 forms (normalised by new URL)', () => {
    expect(() => assertPublicHttpsUrl('https://2130706433/')).toThrow(); // 127.0.0.1
    expect(() => assertPublicHttpsUrl('https://0x7f000001/')).toThrow();
    expect(() => assertPublicHttpsUrl('https://127.1/')).toThrow();
    expect(() => assertPublicHttpsUrl('https://0xA9FEA9FE/')).toThrow(); // 169.254.169.254
  });

  it.each([
    'https://mcp.algolia.com/x',
    'https://mcp.algolia.com/1/mcp?key=abc',
    'https://8.8.8.8/x',
    'https://172.32.0.1/x',
    'https://100.128.0.1/x',
    'https://example.com:8443/mcp',
  ])('accepts %s', (url) => {
    expect(() => assertPublicHttpsUrl(url)).not.toThrow();
    expect(isPublicHttpsUrl(url)).toBe(true);
  });

  it('the error message never contains the URL', () => {
    try {
      assertPublicHttpsUrl('https://user:SENTINEL-pw@host.example.com/x');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain('SENTINEL');
    }
  });
});
