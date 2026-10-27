/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { CacheEntry, CacheStore } from './cache.types';

export interface MemoryCacheOptions {
  maxEntries: number;
  sweepMs: number;
  /** Background sweep is skipped when false (tests). */
  sweep?: boolean;
}

/**
 * In-memory cache backed by a Map keyed by `${namespace}:${key}`.
 * Lazy expiration on get plus an optional background sweep.
 * FIFO eviction when `maxEntries` is reached. An optimisation only:
 * nothing may rely on it for correctness.
 */
export class MemoryCache implements CacheStore {
  private store = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly options: MemoryCacheOptions) {
    if (options.sweep !== false) {
      const timer = setInterval(() => this.sweep(), options.sweepMs);
      timer.unref();
    }
  }

  private composeKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  private evictIfNeeded(): void {
    if (this.store.size >= this.options.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  async get<T>(namespace: string, key: string): Promise<T | null> {
    const composed = this.composeKey(namespace, key);
    const entry = this.store.get(composed);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(composed);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(
    namespace: string,
    key: string,
    value: T,
    ttlMs: number
  ): Promise<void> {
    const composed = this.composeKey(namespace, key);
    if (!this.store.has(composed)) this.evictIfNeeded();
    this.store.set(composed, { value, expiresAt: Date.now() + ttlMs });
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.store.delete(this.composeKey(namespace, key));
  }

  async deletePrefix(namespace: string, keyPrefix: string): Promise<void> {
    const prefix = this.composeKey(namespace, keyPrefix);
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  async clearNamespace(namespace: string): Promise<void> {
    const nsPrefix = `${namespace}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(nsPrefix)) {
        this.store.delete(key);
      }
    }
  }

  stats(): { size: number; namespaces: Record<string, number> } {
    const namespaces: Record<string, number> = {};
    for (const key of this.store.keys()) {
      const ns = key.split(':')[0];
      namespaces[ns] = (namespaces[ns] || 0) + 1;
    }
    return { size: this.store.size, namespaces };
  }
}
