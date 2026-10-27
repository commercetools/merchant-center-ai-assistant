/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

export interface CacheStore {
  get<T>(namespace: string, key: string): Promise<T | null>;
  set<T>(namespace: string, key: string, value: T, ttlMs: number): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  deletePrefix(namespace: string, keyPrefix: string): Promise<void>;
  clearNamespace(namespace: string): Promise<void>;
  stats(): { size: number; namespaces: Record<string, number> };
}
