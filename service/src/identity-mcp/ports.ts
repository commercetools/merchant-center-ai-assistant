/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  AuthStateRecord,
  IdentityBinding,
  IdentityMcpClient,
  TokenRecord,
} from './types';

/** The bound Managed MCP Server plus the project's dynamically registered OAuth client. */
export interface IdentityBindingStore {
  get(): Promise<IdentityBinding | null>;
  /** New `connectedAt` is part of `b`; the stored `client` is dropped. */
  set(b: Omit<IdentityBinding, 'client'>): Promise<void>;
  /** Compare-and-set touching only `client`; `null` removes it. */
  setClient(c: IdentityMcpClient | null): Promise<void>;
  clear(): Promise<void>;
}

/** One record per user. `version` is the object version used for compare-and-delete. */
export interface IdentityTokenStore {
  get(userId: string): Promise<{ record: TokenRecord; version: number } | null>;
  put(record: TokenRecord): Promise<'written' | 'stale-ignored'>;
  deleteIfVersion(
    userId: string,
    version: number
  ): Promise<'deleted' | 'conflict' | 'absent'>;
  delete(userId: string): Promise<void>;
  /** `beforeDelete` is best effort (used to revoke refresh tokens). */
  deleteAll(
    beforeDelete?: (record: TokenRecord) => Promise<void>
  ): Promise<number>;
}

export type ClaimOutcome =
  | { outcome: 'claimed'; record: AuthStateRecord }
  | { outcome: 'unknown' }
  | { outcome: 'expired'; ageMs: number };

/** Single-use PKCE attempts. Expired records are swept by the store. */
export interface IdentityAuthStateStore {
  create(r: AuthStateRecord): Promise<void>;
  claim(state: string): Promise<ClaimOutcome>;
}

export interface IdentityStores {
  binding: IdentityBindingStore;
  tokens: IdentityTokenStore;
  authStates: IdentityAuthStateStore;
}
