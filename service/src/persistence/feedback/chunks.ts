/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { FEEDBACK_CHUNK_BYTES } from '../limits';
import type { FeedbackSnapshotChunk, SnapshotMessage } from '../types/feedback';

/** UTF-8 byte size of a string. Never use `String.length` for size checks. */
export const byteLength = (value: string): number =>
  Buffer.byteLength(value, 'utf8');

/** UTF-8 continuation bytes are `10xxxxxx`; they never start a character. */
const isContinuationByte = (byte: number | undefined): boolean =>
  byte !== undefined && (byte & 0xc0) === 0x80;

/** Largest offset <= `offset` that starts a character. */
const boundaryAtOrBefore = (buffer: Buffer, offset: number): number => {
  let cut = Math.max(0, Math.min(offset, buffer.length));
  while (cut > 0 && isContinuationByte(buffer[cut])) cut -= 1;
  return cut;
};

/** Smallest offset >= `offset` that starts a character. */
const boundaryAtOrAfter = (buffer: Buffer, offset: number): number => {
  let cut = Math.max(0, Math.min(offset, buffer.length));
  while (cut < buffer.length && isContinuationByte(buffer[cut])) cut += 1;
  return cut;
};

/** Shorten to at most `maxBytes` UTF-8 bytes, cutting on a character boundary. */
export const truncateToBytes = (value: string, maxBytes: number): string => {
  if (!value) return value;
  if (maxBytes <= 0) return '';
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return value;
  return buffer.toString('utf8', 0, boundaryAtOrBefore(buffer, maxBytes));
};

/** Object key of one chunk, e.g. `000012-000`; zero padding keeps `key asc` in order. */
export const snapshotChunkDocId = (index: number, chunk: number): string =>
  `${String(index).padStart(6, '0')}-${String(chunk).padStart(3, '0')}`;

/**
 * Splits each message into one or more chunks over UTF-8 bytes (never inside a character),
 * so reassembly by concatenation restores the exact JSON.
 */
export const buildSnapshotChunks = (
  messages: SnapshotMessage[],
  maxChunkBytes: number = FEEDBACK_CHUNK_BYTES
): {
  chunks: FeedbackSnapshotChunk[];
  messageCount: number;
  chunkCount: number;
  snapshotBytes: number;
} => {
  const limit = Math.max(1, Math.floor(maxChunkBytes));
  const source = Array.isArray(messages) ? messages : [];
  const chunks: FeedbackSnapshotChunk[] = [];
  let snapshotBytes = 0;

  source.forEach((message, index) => {
    // `?? 'null'` covers `JSON.stringify(undefined)`.
    const json = JSON.stringify(message) ?? 'null';
    const buffer = Buffer.from(json, 'utf8');
    snapshotBytes += buffer.length;

    const payloads: string[] = [];
    let start = 0;
    while (start < buffer.length) {
      let end = boundaryAtOrBefore(buffer, start + limit);
      if (end <= start) {
        // One character is wider than `limit`: take it whole rather than loop forever.
        end = boundaryAtOrAfter(buffer, start + 1);
      }
      payloads.push(buffer.toString('utf8', start, end));
      start = end;
    }
    if (payloads.length === 0) payloads.push('');

    payloads.forEach((payload, chunk) => {
      chunks.push({
        docId: snapshotChunkDocId(index, chunk),
        index,
        chunk,
        chunks: payloads.length,
        ...(message?.role ? { role: message.role } : {}),
        payload,
      });
    });
  });

  return {
    chunks,
    messageCount: source.length,
    chunkCount: chunks.length,
    snapshotBytes,
  };
};

/** Stand-in for a message whose chunks are missing or corrupt: a gap is shown, not skipped. */
const unreadableSnapshotMessage = (index: number): SnapshotMessage => ({
  id: `feedback-snapshot-unreadable-${index}`,
  role: 'system',
  parts: [
    {
      type: 'text',
      text: `[unreadable snapshot message ${index}: chunk payload could not be parsed]`,
    },
  ],
});

/** Rebuilds the transcript; sorts by `index` then `chunk` instead of trusting read order. */
export const reassembleSnapshot = (
  chunks: readonly Pick<FeedbackSnapshotChunk, 'index' | 'chunk' | 'payload'>[] = []
): SnapshotMessage[] => {
  const grouped = new Map<number, { chunk: number; payload: string }[]>();
  (Array.isArray(chunks) ? chunks : []).forEach((entry) => {
    const index = Number(entry?.index) || 0;
    const slice = {
      chunk: Number(entry?.chunk) || 0,
      payload: typeof entry?.payload === 'string' ? entry.payload : '',
    };
    const existing = grouped.get(index);
    if (existing) existing.push(slice);
    else grouped.set(index, [slice]);
  });

  return Array.from(grouped.keys())
    .sort((a, b) => a - b)
    .map((index) => {
      const json = (grouped.get(index) ?? [])
        .sort((a, b) => a.chunk - b.chunk)
        .map((slice) => slice.payload)
        .join('');
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return unreadableSnapshotMessage(index);
      }
      if (parsed === null || typeof parsed !== 'object') {
        return unreadableSnapshotMessage(index);
      }
      return parsed as SnapshotMessage;
    });
};
