/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createHash } from 'node:crypto';
import type {
  FeedbackTruncation,
  SnapshotMessage,
} from '../persistence/types/feedback';

/**
 * Limits derived from the platform documentation (https://docs.commercetools.com/api/limits.md).
 * 192 KiB raw x 6 (worst-case JSON escaping of control characters) = 1.125 MiB, below the
 * 2 MB per-document guidance.
 */
export const MAX_CHUNK_BYTES = 192 * 1024;
/** Below the 14 MB request body ceiling; 10 MB was measured through the MC gateway. */
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const FEEDBACK_BODY_LIMIT = '10mb';
export const MAX_COMMENT_LENGTH = 5000;
export const MAX_SYSTEM_PROMPT_BYTES = 100_000;
export const MAX_INLINE_DATA_URL_BYTES = 2048;

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

/** Object key of one chunk: `<feedbackId>-<ordinal padded to 3 digits>`. */
export const snapshotChunkKey = (feedbackId: string, ordinal: number): string =>
  `${feedbackId}-${String(ordinal).padStart(3, '0')}`;

type OversizedReporter = (path: string, bytes: number) => void;

const stripString = (value: string, path: string, report: OversizedReporter): string => {
  if (!value.startsWith('data:')) return value;
  const bytes = byteLength(value);
  if (bytes <= MAX_INLINE_DATA_URL_BYTES) return value;
  report(path, bytes);
  return `[omitted: inline data URL, ${bytes} bytes]`;
};

const walkValue = (value: unknown, path: string, report: OversizedReporter): unknown => {
  if (typeof value === 'string') return stripString(value, path, report);
  if (Array.isArray(value)) {
    return value.map((item, i) => walkValue(item, `${path}[${i}]`, report));
  }
  if (value !== null && typeof value === 'object') {
    // Object.fromEntries defines own data properties, so a key literally named
    // `__proto__` survives. A plain `out[key] = ...` would hit the prototype setter and
    // silently drop it.
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        walkValue(item, path ? `${path}.${key}` : key, report),
      ])
    );
  }
  return value;
};

/**
 * Deep-copy the transcript, replacing any oversized inline `data:` URL with a placeholder and
 * recording each replacement. Input is JSON-derived (a request body).
 */
export const stripInlineDataUrls = (
  messages: SnapshotMessage[]
): { messages: SnapshotMessage[]; truncations: FeedbackTruncation[] } => {
  const truncations: FeedbackTruncation[] = [];
  const source = Array.isArray(messages) ? messages : [];

  const sanitized = source.map((message, messageIndex) =>
    walkValue(message, '', (path, bytes) =>
      truncations.push({
        messageIndex,
        ...(typeof message?.id === 'string' ? { messageId: message.id } : {}),
        path: path || '(message)',
        reason: 'inline-data-url',
        originalBytes: bytes,
      })
    ) as SnapshotMessage
  );

  return { messages: sanitized, truncations };
};

export interface BuiltSnapshot {
  payloads: string[];
  messageCount: number;
  chunkCount: number;
  snapshotBytes: number;
  sha256: string;
}

/**
 * Serialises the whole transcript once and splits it into chunks of at most `maxChunkBytes`
 * bytes on UTF-8 character boundaries. The digest is over the bytes, not the string.
 */
export const buildSnapshot = (
  messages: SnapshotMessage[],
  maxChunkBytes: number = MAX_CHUNK_BYTES
): BuiltSnapshot => {
  const list = Array.isArray(messages) ? messages : [];
  const limit = Math.max(1, Math.floor(maxChunkBytes));
  const buffer = Buffer.from(JSON.stringify(list), 'utf8');
  const payloads: string[] = [];
  for (let start = 0; start < buffer.length; ) {
    let end = boundaryAtOrBefore(buffer, start + limit);
    // One character wider than the limit: take it whole rather than loop forever.
    if (end <= start) end = boundaryAtOrAfter(buffer, start + 1);
    payloads.push(buffer.toString('utf8', start, end));
    start = end;
  }
  return {
    payloads,
    messageCount: list.length,
    chunkCount: payloads.length,
    snapshotBytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
};

const unreadable = (reason: string): SnapshotMessage[] => [
  {
    id: 'feedback-snapshot-unreadable',
    role: 'system',
    parts: [{ type: 'text', text: `[unreadable snapshot: ${reason}]` }],
  },
];

/**
 * Concatenates the payloads in ordinal order, verifies the digest and parses the result.
 * Never throws: a missing chunk, a digest mismatch or a parse failure yields one placeholder
 * system message and `intact: false`.
 */
export const reassemble = (input: {
  payloads: ReadonlyArray<string | undefined>;
  expectedChunkCount: number;
  sha256: string | undefined;
}): { messages: SnapshotMessage[]; intact: boolean } => {
  const { payloads, expectedChunkCount, sha256 } = input;
  if (payloads.length !== expectedChunkCount) {
    return { messages: unreadable('chunk missing'), intact: false };
  }
  for (let i = 0; i < expectedChunkCount; i += 1) {
    if (typeof payloads[i] !== 'string') {
      return { messages: unreadable('chunk missing'), intact: false };
    }
  }
  const buffer = Buffer.from(payloads.join(''), 'utf8');
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (!sha256 || digest !== sha256) {
    return { messages: unreadable('digest mismatch'), intact: false };
  }
  try {
    const parsed: unknown = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(parsed)) {
      return { messages: unreadable('not a transcript'), intact: false };
    }
    return { messages: parsed as SnapshotMessage[], intact: true };
  } catch {
    return { messages: unreadable('parse error'), intact: false };
  }
};

/**
 * Keeps the newest messages whose serialised size fits `maxBytes` (server-sourced overflow).
 * Order is preserved; `droppedCount` is how many oldest messages were left out.
 */
export const fitNewest = (
  messages: SnapshotMessage[],
  maxBytes: number
): { messages: SnapshotMessage[]; droppedCount: number } => {
  const budget = maxBytes - 2; // the enclosing "[]"
  let used = 0;
  let keepFrom = messages.length;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const size = byteLength(JSON.stringify(messages[i]) ?? 'null') + 1; // comma
    if (used + size > budget) break;
    used += size;
    keepFrom = i;
  }
  return {
    messages: messages.slice(keepFrom),
    droppedCount: keepFrom,
  };
};
