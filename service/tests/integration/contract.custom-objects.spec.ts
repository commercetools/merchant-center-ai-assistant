/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createPersistence, stateKey } from '../../src/persistence';
import { encryptJson } from '../../src/crypto/envelope';
import { readTranscript, snapshotChunks } from '../helpers/feedback-chunks';
import { describeGatewayContract } from '../helpers/gateway-contract';
import { cleanupRun, live, liveConfig, liveDescribe, liveGateway, newRunPrefix } from './live';

const prefix = newRunPrefix();

if (live) {
  // Raw gateway contract: the same scenarios the in-memory gateway passes.
  describeGatewayContract('custom-objects', liveGateway, {
    prefix,
    cleanup: (names) => cleanupRun(prefix, names),
  });
} else {
  describe.skip('gateway contract: custom-objects (no CTP credentials)', () => {
    it('skipped', () => undefined);
  });
}

liveDescribe('store level on the real gateway', () => {
  const p = () => createPersistence(liveConfig(), { containerPrefix: prefix });
  afterAll(() => cleanupRun(prefix));

  it('sessions and messages: create, list, order, cascade delete', async () => {
    const stores = p();
    await stores.sessions.create({
      id: 'it-s1',
      userId: 'it-user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 1,
    });
    await stores.messages.put('it-s1', [
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'b', role: 'assistant', parts: [{ output: null }] },
      { id: 'c', role: 'user', parts: [] },
    ]);
    expect((await stores.messages.list('it-s1')).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect((await stores.messages.list('it-s1'))[1].parts).toEqual([{ output: null }]);
    expect((await stores.sessions.listByUser('it-user')).map((s) => s.id)).toEqual(['it-s1']);
    expect(await stores.messages.count('it-s1')).toBe(3);
    const { deleteSessionCascade } = await import('../../src/persistence');
    expect(await deleteSessionCascade(stores, 'it-s1')).toBe(true);
    expect(await stores.messages.count('it-s1')).toBe(0);
  });

  it('settings: concurrent partial updates both land', async () => {
    const stores = p();
    await stores.settings.update((s) => ({ ...s }));
    await Promise.all([
      stores.settings.update((s) => ({ ...s, systemPrompt: 'x' })),
      stores.settings.update((s) => ({ ...s, toolCallLogs: 'tools' })),
    ]);
    const s = await createPersistence(liveConfig(), { containerPrefix: prefix }).settings.get();
    expect(s.systemPrompt).toBe('x');
    expect(s.toolCallLogs).toBe('tools');
  });

  it('PKCE state: exactly one of two simultaneous claims wins', async () => {
    const stores = p();
    const state = `it-state-${Date.now()}`;
    await stores.tokens.createAuthState({
      state,
      userId: 'it-user',
      encryptedVerifier: encryptJson('identity-verifier', 'v', stateKey(state)),
      redirectUri: 'https://service.example.test/cb',
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000,
    });
    const r = await Promise.all([stores.tokens.claimAuthState(state), stores.tokens.claimAuthState(state)]);
    expect(r.filter((x) => x.outcome === 'claimed')).toHaveLength(1);
  });

  it('feedback: parent last, byte-identical transcript, delete', async () => {
    const stores = p();
    const messages = [{ id: 'm1', role: 'user' as const, parts: [{ text: 'e\u{1F600}'.repeat(300000) }] }];
    const { chunks, sha256 } = snapshotChunks('it-f1', messages);
    expect(chunks.length).toBeGreaterThan(1);
    await stores.feedback.put(
      {
        id: 'it-f1',
        sessionId: 'it-s1',
        userId: 'it-user',
        comment: 'c',
        createdAt: Date.now(),
        createdAtIso: new Date().toISOString(),
        snapshotSource: 'client',
        messageCount: 1,
        chunkCount: chunks.length,
        snapshotBytes: 1,
        clientMessageCount: 1,
        storedMessageCount: 1,
        truncated: false,
        schemaVersion: 1,
      },
      chunks
    );
    const parts = await stores.feedback.getParts('it-f1');
    expect(readTranscript(parts ?? { chunks: [] }, sha256).messages).toEqual(messages);
    expect(await stores.feedback.delete('it-f1')).toBe(true);
  });
});
