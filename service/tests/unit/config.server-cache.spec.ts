/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { baseEnv, freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

describe('server and cache sections', () => {
  it('applies the defaults', () => {
    const c = freshConfig();
    expect(c.server).toEqual({
      nodeEnv: 'test',
      port: 8080,
      logLevel: 'info',
      logHttp: false,
    });
    expect(c.cache).toEqual({
      maxEntries: 5000,
      sweepMs: 60000,
      mcpToolsTtlMs: 1800000,
      mcpHandshakeTimeoutMs: 10000,
    });
  });

  it('reads valid overrides', () => {
    const c = freshConfig({
      PORT: '8081',
      LOG_LEVEL: 'debug',
      LOG_HTTP: 'true',
      CACHE_MAX_ENTRIES: '2',
    });
    expect(c.server.port).toBe(8081);
    expect(c.server.logLevel).toBe('debug');
    expect(c.server.logHttp).toBe(true);
    expect(c.cache.maxEntries).toBe(2);
  });

  it.each([
    ['PORT', 'abc', /PORT: must be an integer >= 1/],
    ['PORT', '0', /PORT: must be an integer >= 1/],
    ['PORT', '70000', /PORT: must be an integer <= 65535/],
    ['LOG_LEVEL', 'loud', /LOG_LEVEL: must be one of/],
    ['LOG_HTTP', 'yes', /LOG_HTTP: must be "true" or "false"/],
    ['CACHE_MAX_ENTRIES', '1.5', /CACHE_MAX_ENTRIES: must be an integer >= 1/],
    ['CACHE_SWEEP_MS', '-1', /CACHE_SWEEP_MS/],
    ['MCP_TOOLS_TTL_MS', 'x', /MCP_TOOLS_TTL_MS: must be an integer >= 0/],
    ['MCP_HANDSHAKE_TIMEOUT_MS', '0', /MCP_HANDSHAKE_TIMEOUT_MS/],
  ])('rejects %s=%s', (key, value, pattern) => {
    expect(() => freshConfig({ [key]: value })).toThrow(pattern);
    try {
      freshConfig({ [key]: value });
    } catch (e) {
      expect((e as Error).message).not.toContain(`=${value}`);
    }
  });

  it('treats blank values as unset', () => {
    expect(freshConfig({ PORT: '  ', LOG_LEVEL: '' }).server.port).toBe(8080);
    expect(baseEnv().PORT).toBeUndefined();
  });
});
