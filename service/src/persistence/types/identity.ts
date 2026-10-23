/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Envelope } from '../../crypto/envelope';
import { isRecord } from './session';

/**
 * One object per user. The store never sees plaintext: `encryptedTokens` is produced by
 * `encryptJson('identity-tokens', tokens, userId)` in the identity change.
 */
export interface IdentityTokenRecord {
  userId: string;
  serverKey: string;
  encryptedTokens: Envelope;
  /** Epoch ms. */
  accessTokenExpiresAt?: number;
  hasRefreshToken: boolean;
  scope?: string;
  /** Epoch ms; an older grant never overwrites a newer one. */
  issuedAt: number;
  updatedAt: number;
  bindingConnectedAt?: number;
}

/**
 * One PKCE login attempt. `state` is the plaintext random value (never stored: the key is its
 * hash); `encryptedVerifier` is encrypted with aad = the state hash.
 */
export interface IdentityAuthStateRecord {
  state: string;
  userId: string;
  encryptedVerifier: Envelope;
  redirectUri: string;
  authorizationServerUrl?: string;
  bindingConnectedAt?: number;
  createdAt: number;
  expiresAt: number;
}

/** What is stored for a state: everything except the plaintext state. */
export type IdentityAuthStateValue = Omit<IdentityAuthStateRecord, 'state'>;

export type ClaimResult =
  | { outcome: 'claimed'; record: IdentityAuthStateRecord }
  | { outcome: 'unknown' }
  | { outcome: 'expired'; ageMs: number };

export function tokenToValue(r: IdentityTokenRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
}

export function tokenFromValue(v: unknown): IdentityTokenRecord {
  if (!isRecord(v)) throw new Error('Stored token record is malformed');
  return v as unknown as IdentityTokenRecord;
}

export function stateToValue(r: IdentityAuthStateRecord): IdentityAuthStateValue {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { state: _state, ...rest } = r;
  return JSON.parse(JSON.stringify(rest)) as IdentityAuthStateValue;
}

export function stateFromValue(
  state: string,
  v: unknown
): IdentityAuthStateRecord | null {
  if (!isRecord(v) || typeof v.userId !== 'string') return null;
  return { ...(v as unknown as IdentityAuthStateValue), state };
}
