/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { FeedbackRecord, SnapshotMessage } from '../../../src/persistence';
import { readTranscript, snapshotChunks } from '../../helpers/feedback-chunks';
import { makePersistence, spyGateway } from '../../helpers/persistence';

const record = (id: string, userId: string, over: Partial<FeedbackRecord> = {}): FeedbackRecord => ({
  id,
  sessionId: 's1',
  userId,
  comment: 'bad',
  createdAt: 1,
  createdAtIso: '1970-01-01T00:00:00.001Z',
  snapshotSource: 'client',
  messageCount: 0,
  chunkCount: 0,
  snapshotBytes: 0,
  clientMessageCount: 0,
  storedMessageCount: 0,
  truncated: false,
  schemaVersion: 1,
  ...over,
});

const transcript: SnapshotMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi \u{1F600}' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'tool-x', output: null }, { text: 'x'.repeat(2500) }] },
  { id: 'm3', role: 'user', parts: [] },
];

describe('FeedbackStore', () => {
  it('returns the chunks in key order so the snapshot reassembles byte-identically, including emoji and null', async () => {
    const { p } = makePersistence();
    const { chunks, sha256 } = snapshotChunks('f1', transcript, 500);
    expect(chunks.length).toBeGreaterThan(3);
    await p.feedback.put(record('f1', 'u1'), chunks);
    const parts = await p.feedback.getParts('f1');
    expect(parts?.record.comment).toBe('bad');
    expect(parts?.chunks).toHaveLength(chunks.length);
    expect(readTranscript(parts ?? { chunks: [] }, sha256)).toEqual({ messages: transcript, intact: true });
  });

  it('writes no parent when a chunk write fails, so nothing is listed', async () => {
    let puts = 0;
    const { p, mem } = makePersistence((gw) =>
      spyGateway(gw, {
        onPut: (container) => {
          if (container.includes('feedback-snap')) {
            puts += 1;
            if (puts === 3) throw new Error('chunk 3 failed');
          }
        },
      })
    );
    const { chunks } = snapshotChunks('f1', transcript, 500);
    await expect(p.feedback.put(record('f1', 'u1'), chunks)).rejects.toThrow('chunk 3 failed');
    expect(await mem.get('ai-assistant-feedback', 'f1')).toBeNull();
    expect((await p.feedback.list({}, 10, 0)).items).toEqual([]);
    expect(await p.feedback.getParts('f1')).toBeNull();
  });

  it('lists newest first with the projection only', async () => {
    const { p } = makePersistence();
    const sysPrompt = 'P'.repeat(50_000);
    await p.feedback.put(record('f1', 'u1', { systemPrompt: sysPrompt, disabledTools: { a: ['b'] } }), []);
    await p.feedback.put(record('f2', 'u2', { sessionTitle: 'T' }), []);
    const list = await p.feedback.list({}, 10, 0);
    expect(list.total).toBe(2);
    expect(list.items.map((i) => i.id)).toEqual(['f2', 'f1']);
    for (const item of list.items) {
      expect(item).not.toHaveProperty('systemPrompt');
      expect(item).not.toHaveProperty('disabledTools');
      expect(item).not.toHaveProperty('messages');
    }
    expect(JSON.stringify(list)).not.toContain('PPPP');
  });

  it('separates two submitters that claim the same label', async () => {
    const { p } = makePersistence();
    await p.feedback.put(record('f1', 'userA', { userLabel: 'same@example.test' }), []);
    await p.feedback.put(record('f2', 'userB', { userLabel: 'same@example.test' }), []);
    expect((await p.feedback.list({ authorUserId: 'userA' }, 10, 0)).items.map((i) => i.id)).toEqual(['f1']);
    expect((await p.feedback.list({ authorUserId: 'userB' }, 10, 0)).items.map((i) => i.id)).toEqual(['f2']);
  });

  it('filters by time', async () => {
    const { p, mem } = makePersistence();
    await p.feedback.put(record('f1', 'u'), []);
    await p.feedback.put(record('f2', 'u'), []);
    const f1 = await mem.get('ai-assistant-feedback', 'f1');
    const after = await p.feedback.list({ createdAfter: f1?.createdAt }, 10, 0);
    expect(after.items.map((i) => i.id)).toEqual(['f2']);
    const before = await p.feedback.list({ createdBefore: (await mem.get('ai-assistant-feedback', 'f2'))?.createdAt }, 10, 0);
    expect(before.items.map((i) => i.id)).toEqual(['f1']);
  });

  it('deletes the parent first, then the chunks, and can be re-run', async () => {
    const order: string[] = [];
    const { p, mem } = makePersistence((gw) =>
      spyGateway(gw, { onDelete: (c, k) => void order.push(c.includes('snap') ? 'chunk' : `parent:${k}`) })
    );
    await p.feedback.put(record('f1', 'u1'), snapshotChunks('f1', transcript, 400).chunks);
    expect(await p.feedback.delete('f1')).toBe(true);
    expect(order[0]).toBe('parent:f1');
    expect(order.slice(1).every((o) => o === 'chunk')).toBe(true);
    expect(order.length).toBeGreaterThan(2);
    expect(mem.containerNames()).toEqual([]);
    expect(await p.feedback.delete('f1')).toBe(false);
  });

  it('hides the record when deletion is interrupted after the parent, and finishes later', async () => {
    let failed = false;
    const { p, mem } = makePersistence((gw) =>
      spyGateway(gw, {
        onDelete: (c) => {
          if (c.includes('snap') && !failed) {
            failed = true;
            throw new Error('interrupted');
          }
        },
      })
    );
    await p.feedback.put(record('f1', 'u1'), snapshotChunks('f1', transcript, 400).chunks);
    await expect(p.feedback.delete('f1')).rejects.toThrow('interrupted');
    expect(await p.feedback.getParts('f1')).toBeNull();
    expect(mem.containerNames()).toContain('ai-assistant-feedback-snap-f1');
    expect(await p.feedback.delete('f1')).toBe(false);
    expect(mem.containerNames()).toEqual([]);
  });
});
