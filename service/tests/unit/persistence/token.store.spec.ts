/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import { decryptJson, encryptJson } from '../../../src/crypto/envelope';
import { KeyRing } from '../../../src/crypto/keys';
import { stateKey } from '../../../src/persistence';
import { GatewayTokenStore } from '../../../src/persistence/stores/token.store';
import { containers } from '../../../src/persistence/names';
import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';
import type { IdentityAuthStateRecord, IdentityTokenRecord } from '../../../src/persistence';
import { stateToValue } from '../../../src/persistence/types/identity';
import { makePersistence, spyGateway } from '../../helpers/persistence';

const ring: KeyRing = { primary: randomBytes(32), previous: [] };
const FAKE = 'SECRET-TOKEN-123';

const tokens = (issuedAt: number, userId = 'u1'): IdentityTokenRecord => ({
  userId,
  serverKey: 'sk',
  encryptedTokens: encryptJson('identity-tokens', { access_token: FAKE }, userId, ring),
  hasRefreshToken: true,
  issuedAt,
  updatedAt: issuedAt,
});

const authState = (state: string, over: Partial<IdentityAuthStateRecord> = {}): IdentityAuthStateRecord => ({
  state,
  userId: 'u1',
  encryptedVerifier: encryptJson('identity-verifier', 'verifier-xyz', stateKey(state), ring),
  redirectUri: 'https://service.example.test/cb',
  createdAt: Date.now(),
  expiresAt: Date.now() + 600_000,
  ...over,
});

describe('TokenStore tokens', () => {
  it('ignores an out-of-order older grant', async () => {
    const { p } = makePersistence();
    expect(await p.tokens.putTokens(tokens(200))).toBe('written');
    expect(await p.tokens.putTokens(tokens(100))).toBe('stale-ignored');
    expect((await p.tokens.getTokens('u1'))?.issuedAt).toBe(200);
    expect(await p.tokens.putTokens(tokens(300))).toBe('written');
  });

  it('never stores a plaintext token', async () => {
    const { p, mem } = makePersistence();
    await p.tokens.putTokens(tokens(1));
    const raw = JSON.stringify(await mem.get('ai-assistant-identity-tokens', 'u1'));
    expect(raw).not.toContain(FAKE);
    const rec = await p.tokens.getTokens('u1');
    expect(decryptJson('identity-tokens', rec?.encryptedTokens, 'u1', ring)).toEqual({
      access_token: FAKE,
    });
  });

  it('deletes tokens and returns null afterwards', async () => {
    const { p } = makePersistence();
    await p.tokens.putTokens(tokens(1));
    await p.tokens.deleteTokens('u1');
    expect(await p.tokens.getTokens('u1')).toBeNull();
    await expect(p.tokens.deleteTokens('u1')).resolves.toBeUndefined();
  });
});

describe('TokenStore PKCE states', () => {
  it('claims once and reports a replay as unknown', async () => {
    const { p } = makePersistence();
    await p.tokens.createAuthState(authState('abc+/='));
    const first = await p.tokens.claimAuthState('abc+/=');
    expect(first.outcome).toBe('claimed');
    if (first.outcome === 'claimed') {
      expect(first.record.state).toBe('abc+/=');
      expect(first.record.userId).toBe('u1');
    }
    expect(await p.tokens.claimAuthState('abc+/=')).toEqual({ outcome: 'unknown' });
  });

  it('stores the state under its hash and never in plaintext', async () => {
    const { p, mem } = makePersistence();
    await p.tokens.createAuthState(authState('abc+/='));
    const obj = await mem.get('ai-assistant-identity-auth-states', stateKey('abc+/='));
    expect(obj).not.toBeNull();
    expect(JSON.stringify(obj)).not.toContain('abc+/=');
  });

  it('lets exactly one of two simultaneous claims win', async () => {
    const { p } = makePersistence();
    await p.tokens.createAuthState(authState('race'));
    const [a, b] = await Promise.all([
      p.tokens.claimAuthState('race'),
      p.tokens.claimAuthState('race'),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['claimed', 'unknown']);
  });

  it('lets exactly one of many claims win', async () => {
    const { p } = makePersistence();
    await p.tokens.createAuthState(authState('many'));
    const results = await Promise.all(
      Array.from({ length: 10 }, () => p.tokens.claimAuthState('many'))
    );
    expect(results.filter((r) => r.outcome === 'claimed')).toHaveLength(1);
  });

  it('reports an expired state and removes it', async () => {
    const { p, mem } = makePersistence();
    await p.tokens.createAuthState(
      authState('old', { createdAt: Date.now() - 700_000, expiresAt: Date.now() - 100_000 })
    );
    const r = await p.tokens.claimAuthState('old');
    expect(r.outcome).toBe('expired');
    if (r.outcome === 'expired') expect(r.ageMs).toBeGreaterThanOrEqual(700_000);
    expect(await mem.get('ai-assistant-identity-auth-states', stateKey('old'))).toBeNull();
  });

  it('treats unknown and empty states as unknown', async () => {
    const { p } = makePersistence();
    expect(await p.tokens.claimAuthState('nope')).toEqual({ outcome: 'unknown' });
    expect(await p.tokens.claimAuthState('')).toEqual({ outcome: 'unknown' });
  });

  it('sweeps only states older than the threshold', async () => {
    let clock = Date.parse('2026-01-01T00:00:00.000Z');
    const mem = new MemoryObjectGateway(() => clock);
    const store = new GatewayTokenStore(
      { gw: mem, c: containers(), concurrency: 4 },
      () => clock
    );
    // seeded directly, so the opportunistic sweep of createAuthState does not interfere
    await mem.put('ai-assistant-identity-auth-states', stateKey('oldone'), stateToValue(authState('oldone')));
    clock += 2 * 3_600_000;
    await mem.put('ai-assistant-identity-auth-states', stateKey('fresh'), stateToValue(authState('fresh')));
    expect(await store.sweepExpiredAuthStates({ olderThanMs: 3_600_000 })).toBe(1);
    expect(await mem.get('ai-assistant-identity-auth-states', stateKey('oldone'))).toBeNull();
    expect(await mem.get('ai-assistant-identity-auth-states', stateKey('fresh'))).not.toBeNull();
  });

  it('never lets a failing sweep break createAuthState', async () => {
    const mem = new MemoryObjectGateway();
    const spy = spyGateway(mem, {
      onQuery: () => {
        throw new Error('query down');
      },
    });
    const store = new GatewayTokenStore({ gw: spy, c: containers(), concurrency: 4 });
    await expect(store.createAuthState(authState('s1'))).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 5));
    expect(await mem.get('ai-assistant-identity-auth-states', stateKey('s1'))).not.toBeNull();
  });

  it('triggers the sweep at most once per minute', async () => {
    const mem = new MemoryObjectGateway();
    const spy = spyGateway(mem);
    const store = new GatewayTokenStore({ gw: spy, c: containers(), concurrency: 4 });
    await store.createAuthState(authState('a'));
    await store.createAuthState(authState('b'));
    await new Promise((r) => setTimeout(r, 5));
    expect(spy.calls.filter((c) => c.startsWith('query'))).toHaveLength(1);
  });
});
