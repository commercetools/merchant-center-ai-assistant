/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  buildSnapshotChunks,
  byteLength,
  reassembleSnapshot,
  snapshotChunkDocId,
  truncateToBytes,
} from '../../../src/persistence/feedback/chunks';
import { FEEDBACK_CHUNK_BYTES } from '../../../src/persistence/limits';
import type { SnapshotMessage } from '../../../src/persistence/types/feedback';

const big = (bytes: number): SnapshotMessage => ({
  id: 'big',
  role: 'assistant',
  parts: [{ type: 'text', text: 'a'.repeat(bytes) }],
});

describe('feedback chunks', () => {
  it('splits a 1.3 MB message into 3 chunks of at most 524288 bytes', () => {
    const { chunks, chunkCount, messageCount } = buildSnapshotChunks([big(1_300_000)]);
    expect(messageCount).toBe(1);
    expect(chunkCount).toBe(3);
    for (const c of chunks) expect(byteLength(c.payload)).toBeLessThanOrEqual(FEEDBACK_CHUNK_BYTES);
    expect(chunks.map((c) => c.docId)).toEqual(['000000-000', '000000-001', '000000-002']);
    expect(chunks.every((c) => c.chunks === 3)).toBe(true);
    expect(reassembleSnapshot(chunks)).toEqual([big(1_300_000)]);
  });

  it('never splits a multibyte character', () => {
    const emoji: SnapshotMessage = { id: 'e', role: 'user', parts: [{ text: '\u{1F600}'.repeat(50) }] };
    const { chunks } = buildSnapshotChunks([emoji], 7);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.payload).not.toContain('�');
      expect(Buffer.from(c.payload, 'utf8').toString('utf8')).toBe(c.payload);
    }
    expect(reassembleSnapshot(chunks)).toEqual([emoji]);
  });

  it('terminates when one character is wider than the chunk size', () => {
    const { chunks } = buildSnapshotChunks([{ id: 'x', parts: ['\u{1F600}'] }], 1);
    expect(reassembleSnapshot(chunks)).toEqual([{ id: 'x', parts: ['\u{1F600}'] }]);
  });

  it('keeps null members inside the string payload', () => {
    const m: SnapshotMessage = { id: 'n', role: 'assistant', parts: [{ output: null }] };
    expect(reassembleSnapshot(buildSnapshotChunks([m]).chunks)).toEqual([m]);
  });

  it('handles an empty transcript and an empty-string payload', () => {
    expect(buildSnapshotChunks([]).chunks).toEqual([]);
    expect(reassembleSnapshot([])).toEqual([]);
    // an undefined message serialises to the JSON text "null": unreadable stand-in on read
    const { chunks } = buildSnapshotChunks([undefined as unknown as SnapshotMessage]);
    expect(chunks).toHaveLength(1);
    expect(reassembleSnapshot(chunks)[0].role).toBe('system');
  });

  it('re-sorts out-of-order input', () => {
    const msgs: SnapshotMessage[] = [big(30), { id: 'two', role: 'user' }, big(30)];
    const { chunks } = buildSnapshotChunks(msgs, 20);
    const shuffled = [...chunks].reverse();
    expect(reassembleSnapshot(shuffled)).toEqual(msgs);
  });

  it('renders a corrupt message as an unreadable stand-in', () => {
    const out = reassembleSnapshot([{ index: 0, chunk: 0, payload: '{"broken' }]);
    expect(out[0].id).toBe('feedback-snapshot-unreadable-0');
  });

  it('builds padded keys and truncates on character boundaries', () => {
    expect(snapshotChunkDocId(12, 0)).toBe('000012-000');
    expect(truncateToBytes('a\u{1F600}b', 3)).toBe('a');
    expect(truncateToBytes('abc', 10)).toBe('abc');
    expect(truncateToBytes('abc', 0)).toBe('');
  });
});
