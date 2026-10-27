/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration } from '../config';
import { CacheStore } from './cache.types';
import { MemoryCache } from './memory-cache';

let instance: CacheStore | undefined;

/**
 * Lazily created singleton (limits come from the configuration, which is not
 * readable at import time). Swap the implementation here to change the store.
 */
export function getCache(): CacheStore {
  if (!instance) {
    const { cache, server } = readConfiguration();
    instance = new MemoryCache({
      maxEntries: cache.maxEntries,
      sweepMs: cache.sweepMs,
      sweep: server.nodeEnv !== 'test',
    });
  }
  return instance;
}

export const CACHE_NS = {
  MCP_TOOLS: 'mcp:tools',
  /**
   * Identity-mode Managed MCP tool sets. A namespace of its own, not a key prefix inside
   * `MCP_TOOLS`, so prefix sweeps of the shared pool can never reach per-user entries.
   */
  MCP_IDENTITY_TOOLS: 'mcp:identity-tools',
  AGENT: 'agent', // reserved
  PROMPT: 'prompt', // reserved
} as const;

export type { CacheStore } from './cache.types';
export type { CacheEntry } from './cache.types';
