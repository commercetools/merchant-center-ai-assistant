/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import { SKIP, updateWithRetry } from '../gateway/cas';
import { mapBounded } from '../gateway/concurrency';
import { ConflictError, InvalidIdError } from '../gateway/errors';
import { assertSafeId, stateKey } from '../names';
import {
  ClaimResult,
  IdentityAuthStateRecord,
  IdentityTokenRecord,
  stateFromValue,
  stateToValue,
  tokenFromValue,
  tokenToValue,
} from '../types/identity';
import type { StoreDeps } from './deps';

export interface TokenStore {
  getTokens(userId: string): Promise<IdentityTokenRecord | null>;
  /** `'stale-ignored'` when a strictly newer grant is already stored. */
  putTokens(r: IdentityTokenRecord): Promise<'written' | 'stale-ignored'>;
  deleteTokens(userId: string): Promise<void>;
  /**
   * `encryptedVerifier` must already be encrypted with `aad = stateKey(state)`: this store
   * never sees plaintext secrets.
   */
  createAuthState(r: IdentityAuthStateRecord): Promise<void>;
  /** Exactly one of several simultaneous claims gets `claimed`. */
  claimAuthState(state: string): Promise<ClaimResult>;
  sweepExpiredAuthStates(o?: { olderThanMs?: number; max?: number }): Promise<number>;
}

const SWEEP_EVERY_MS = 60_000;

export class GatewayTokenStore implements TokenStore {
  private lastSweepAt = 0;

  constructor(
    private readonly deps: StoreDeps,
    private readonly now: () => number = Date.now
  ) {}

  async getTokens(userId: string): Promise<IdentityTokenRecord | null> {
    const obj = await this.deps.gw.get(this.deps.c.tokens(), assertSafeId(userId));
    return obj ? tokenFromValue(obj.value) : null;
  }

  async putTokens(r: IdentityTokenRecord): Promise<'written' | 'stale-ignored'> {
    const result = await updateWithRetry<Record<string, unknown>>(
      this.deps.gw,
      this.deps.c.tokens(),
      assertSafeId(r.userId),
      (cur) => {
        const existing = cur ? tokenFromValue(cur) : null;
        if (existing && existing.issuedAt > r.issuedAt) return SKIP;
        return tokenToValue(r);
      }
    );
    return result.written ? 'written' : 'stale-ignored';
  }

  async deleteTokens(userId: string): Promise<void> {
    await this.deps.gw.delete(this.deps.c.tokens(), assertSafeId(userId));
  }

  async createAuthState(r: IdentityAuthStateRecord): Promise<void> {
    assertSafeId(r.userId);
    if (typeof r.state !== 'string' || r.state === '') {
      throw new InvalidIdError('Invalid state');
    }
    this.maybeSweep();
    await this.deps.gw.put(this.deps.c.states(), stateKey(r.state), stateToValue(r));
  }

  async claimAuthState(state: string): Promise<ClaimResult> {
    if (typeof state !== 'string' || state === '') return { outcome: 'unknown' };
    const key = stateKey(state);
    const container = this.deps.c.states();
    const obj = await this.deps.gw.get(container, key);
    if (!obj) return { outcome: 'unknown' };
    const record = stateFromValue(state, obj.value);
    // Delete-with-version is the single atomic claim: whoever deletes it owns it.
    let won;
    try {
      won = await this.deps.gw.delete(container, key, { ifVersion: obj.version });
    } catch (e) {
      if (e instanceof ConflictError) return { outcome: 'unknown' };
      throw e;
    }
    if (!won || !record) return { outcome: 'unknown' };
    const now = this.now();
    if (record.expiresAt <= now) {
      return { outcome: 'expired', ageMs: now - record.createdAt };
    }
    return { outcome: 'claimed', record };
  }

  async sweepExpiredAuthStates(
    o: { olderThanMs?: number; max?: number } = {}
  ): Promise<number> {
    const olderThanMs = o.olderThanMs ?? 3_600_000;
    const max = Math.min(Math.max(o.max ?? 100, 1), 500);
    const container = this.deps.c.states();
    const cutoff = new Date(this.now() - olderThanMs).toISOString();
    const page = await this.deps.gw.query(container, {
      filters: [{ kind: 'time', field: 'createdAt', op: '<', iso: cutoff }],
      sort: { field: 'createdAt', dir: 'asc' },
      limit: max,
    });
    const deleted = await mapBounded(page.results, this.deps.concurrency, (r) =>
      this.deps.gw.delete(container, r.key)
    );
    return deleted.filter((d) => d !== null).length;
  }

  /** Fire-and-forget, at most once per minute per process; failures are only logged. */
  private maybeSweep(): void {
    const now = this.now();
    if (now - this.lastSweepAt < SWEEP_EVERY_MS) return;
    this.lastSweepAt = now;
    this.sweepExpiredAuthStates().catch((e: unknown) => {
      logger.warn(`persistence: auth state sweep failed (${(e as Error).name})`);
    });
  }
}
