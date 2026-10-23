/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { int } from '../parse';
import { SectionParser } from '../types';

export interface CacheConfig {
  maxEntries: number;
  sweepMs: number;
  mcpToolsTtlMs: number;
  mcpHandshakeTimeoutMs: number;
}

export const parseCache: SectionParser<CacheConfig> = (env) => {
  const errors: string[] = [];
  const value: CacheConfig = {
    maxEntries: int(env, 'CACHE_MAX_ENTRIES', 5000, { min: 1 }, errors),
    sweepMs: int(env, 'CACHE_SWEEP_MS', 60000, { min: 1 }, errors),
    mcpToolsTtlMs: int(env, 'MCP_TOOLS_TTL_MS', 1800000, { min: 0 }, errors),
    mcpHandshakeTimeoutMs: int(
      env,
      'MCP_HANDSHAKE_TIMEOUT_MS',
      10000,
      { min: 1 },
      errors
    ),
  };
  return { value, errors };
};
