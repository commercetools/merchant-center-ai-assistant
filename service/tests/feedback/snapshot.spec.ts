/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createHash } from 'node:crypto';
import {
  buildSnapshot,
  byteLength,
  fitNewest,
  FEEDBACK_BODY_LIMIT,
  MAX_CHUNK_BYTES,
  MAX_COMMENT_LENGTH,
  MAX_INLINE_DATA_URL_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_SYSTEM_PROMPT_BYTES,
  reassemble,
  snapshotChunkKey,
  stripInlineDataUrls,
  truncateToBytes,
} from '../../src/utils/feedback-snapshot';
import type { SnapshotMessage } from '../../src/persistence/types/feedback';

const msg = (id: string, text: string): SnapshotMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

describe('limits', () => {
  it('has the documented values', () => {
    expect(MAX_CHUNK_BYTES).toBe(196608);
    expect(MAX_SNAPSHOT_BYTES).toBe(8388608);
    expect(FEEDBACK_BODY_LIMIT).toBe('10mb');
    expect(MAX_COMMENT_LENGTH).toBe(5000);
    expect(MAX_SYSTEM_PROMPT_BYTES).toBe(100000);
    expect(MAX_INLINE_DATA_URL_BYTES).toBe(2048);
  });

  it('keeps the chunk and snapshot size limits consistent', () => {
    expect(MAX_CHUNK_BYTES * 6).toBeLessThan(2 * 1024 * 1024);
    expect(MAX_SNAPSHOT_BYTES).toBeLessThan(14 * 1024 * 1024);
    expect(Math.ceil(MAX_SNAPSHOT_BYTES / MAX_CHUNK_BYTES)).toBeLessThanOrEqual(43);
  });
});

describe('truncateToBytes / byteLength', () => {
  it('cuts on a character boundary', () => {
    const out = truncateToBytes('€€€€', 10);
    expect(out).toBe('€€€');
    expect(byteLength(out)).toBe(9);
  });

  it('leaves short strings alone and handles empty', () => {
    expect(truncateToBytes('abc', 10)).toBe('abc');
    expect(truncateToBytes('', 10)).toBe('');
    expect(truncateToBytes('abc', 0)).toBe('');
  });

  it('measures bytes, not characters', () => {
    expect(byteLength('€')).toBe(3);
    expect(byteLength('😀')).toBe(4);
  });
});

describe('snapshotChunkKey', () => {
  it('pads the ordinal to three digits', () => {
    expect(snapshotChunkKey('abc', 7)).toBe('abc-007');
    expect(snapshotChunkKey('abc', 42)).toBe('abc-042');
  });
});

describe('stripInlineDataUrls', () => {
  it('replaces a large data URL and records it', () => {
    const big = `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const input = [
      { id: 'm1', role: 'assistant', parts: [{ type: 'file', url: big }] },
    ] as SnapshotMessage[];
    const { messages, truncations } = stripInlineDataUrls(input);
    const part = (messages[0].parts as Array<{ url: string }>)[0];
    expect(part.url).toBe(`[omitted: inline data URL, ${byteLength(big)} bytes]`);
    expect(truncations).toEqual([
      {
        messageIndex: 0,
        messageId: 'm1',
        path: 'parts[0].url',
        reason: 'inline-data-url',
        originalBytes: byteLength(big),
      },
    ]);
    // the input is not mutated
    expect((input[0].parts as Array<{ url: string }>)[0].url).toBe(big);
  });

  it('keeps small data URLs and service-relative image paths', () => {
    const small = 'data:image/png;base64,AAAA';
    const { messages, truncations } = stripInlineDataUrls([
      {
        id: 'm',
        parts: [
          { type: 'file', url: small },
          { type: 'file', url: '/files/s1/a.png' },
        ],
      },
    ]);
    expect(truncations).toEqual([]);
    expect((messages[0].parts as Array<{ url: string }>).map((p) => p.url)).toEqual([
      small,
      '/files/s1/a.png',
    ]);
  });

  it('keeps a __proto__ key', () => {
    const input = JSON.parse(
      '[{"id":"m","parts":[{"__proto__":{"x":1},"type":"text","text":"t"}]}]'
    ) as SnapshotMessage[];
    const { messages } = stripInlineDataUrls(input);
    const part = (messages[0].parts as object[])[0];
    expect(Object.keys(part)).toContain('__proto__');
  });
});

describe('buildSnapshot / reassemble', () => {
  it('round-trips 3 MiB and matches the digest', () => {
    const messages = [msg('a', 'x'.repeat(3 * 1024 * 1024))];
    const built = buildSnapshot(messages);
    expect(built.chunkCount).toBe(Math.ceil(built.snapshotBytes / MAX_CHUNK_BYTES));
    built.payloads.forEach((p) =>
      expect(byteLength(p)).toBeLessThanOrEqual(MAX_CHUNK_BYTES)
    );
    const out = reassemble({
      payloads: built.payloads,
      expectedChunkCount: built.chunkCount,
      sha256: built.sha256,
    });
    expect(out.intact).toBe(true);
    expect(out.messages).toEqual(messages);
  });

  it('never splits a multi-byte character across chunks', () => {
    // Sweep the padding so an emoji lands on every position around the boundary.
    for (let pad = 0; pad < 8; pad += 1) {
      const messages = [msg('a', `${'a'.repeat(pad)}😀😀😀😀😀😀`)];
      const built = buildSnapshot(messages, 16);
      built.payloads.forEach((p) => expect(p).not.toContain('�'));
      const out = reassemble({
        payloads: built.payloads,
        expectedChunkCount: built.chunkCount,
        sha256: built.sha256,
      });
      expect(out.intact).toBe(true);
      expect(out.messages).toEqual(messages);
    }
  });

  it('gives exactly 3 chunks for 400 000 bytes', () => {
    const base = JSON.stringify([msg('a', '')]).length;
    const messages = [msg('a', 'x'.repeat(400_000 - base))];
    const built = buildSnapshot(messages);
    expect(built.snapshotBytes).toBe(400_000);
    expect(built.chunkCount).toBe(3);
    built.payloads.forEach((p) => expect(byteLength(p)).toBeLessThanOrEqual(196_608));
  });

  it('stores an empty transcript as one chunk containing []', () => {
    const built = buildSnapshot([]);
    expect(built.payloads).toEqual(['[]']);
    expect(built.messageCount).toBe(0);
  });

  it('survives a character wider than the limit', () => {
    const built = buildSnapshot([msg('a', '😀')], 1);
    expect(built.payloads.join('')).toBe(JSON.stringify([msg('a', '😀')]));
  });

  it('digest is over bytes (sha256 of the utf8 JSON)', () => {
    const built = buildSnapshot([msg('a', '€')]);
    expect(built.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a missing chunk', () => {
    const built = buildSnapshot([msg('a', 'x'.repeat(500))], 200);
    expect(built.chunkCount).toBeGreaterThan(2);
    const payloads = built.payloads.slice();
    payloads[1] = undefined as unknown as string;
    const out = reassemble({
      payloads,
      expectedChunkCount: built.chunkCount,
      sha256: built.sha256,
    });
    expect(out.intact).toBe(false);
    expect(JSON.stringify(out.messages)).toContain('[unreadable snapshot: chunk missing]');
  });

  it('reports fewer chunks than expected', () => {
    const built = buildSnapshot([msg('a', 'x'.repeat(500))], 200);
    const out = reassemble({
      payloads: built.payloads.slice(0, 1),
      expectedChunkCount: built.chunkCount,
      sha256: built.sha256,
    });
    expect(out.intact).toBe(false);
  });

  it('reports a digest mismatch', () => {
    const built = buildSnapshot([msg('a', 'hello')]);
    const out = reassemble({
      payloads: [built.payloads[0].replace('hello', 'jello')],
      expectedChunkCount: 1,
      sha256: built.sha256,
    });
    expect(out.intact).toBe(false);
    expect(JSON.stringify(out.messages)).toContain('digest mismatch');
  });

  it('reports a missing digest and unparsable content without throwing', () => {
    expect(
      reassemble({ payloads: ['[]'], expectedChunkCount: 1, sha256: undefined }).intact
    ).toBe(false);
    const bad = 'not json';
    const sha = createHash('sha256').update(bad).digest('hex');
    const out = reassemble({ payloads: [bad], expectedChunkCount: 1, sha256: sha });
    expect(out.intact).toBe(false);
    expect(JSON.stringify(out.messages)).toContain('parse error');
  });
});

describe('fitNewest', () => {
  it('keeps a newest suffix within the budget, in order', () => {
    const MIB = 1024 * 1024;
    const messages = Array.from({ length: 20 }, (_, i) =>
      msg(`m${i}`, `${i}`.padStart(4, '0') + 'x'.repeat(MIB - 4))
    );
    const out = fitNewest(messages, MAX_SNAPSHOT_BYTES);
    expect(out.messages.length).toBeGreaterThan(0);
    expect(out.droppedCount).toBe(20 - out.messages.length);
    expect(out.messages[out.messages.length - 1].id).toBe('m19');
    const ids = out.messages.map((m) => String(m.id));
    expect(ids).toEqual([...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
    expect(buildSnapshot(out.messages).snapshotBytes).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
  });

  it('keeps everything when it fits', () => {
    const out = fitNewest([msg('a', 'x')], 1000);
    expect(out).toEqual({ messages: [msg('a', 'x')], droppedCount: 0 });
  });
});
