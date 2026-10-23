/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { UIMessage } from 'ai';

/**
 * Builds the message snapshot posted with a session feedback submission.
 *
 * The client's in-memory `useChat` array is the ONLY place reasoning parts and
 * most tool calls exist - the service strips them before writing to Firestore
 * (`processMessagesForStorage`). So this snapshot is the payload, and the two
 * jobs here are (a) don't ship megabytes of base64 that nobody will read and
 * (b) don't ship a body so large it is rejected outright.
 *
 * Everything that is not an oversized inline `data:` URL is preserved
 * VERBATIM - reasoning parts, every tool call, unknown/future part types,
 * metadata. A reviewer's job is to judge what the user actually saw, so this
 * deliberately does no filtering, reshaping or key whitelisting.
 */

/**
 * A string starting with `data:` longer than this is replaced by a
 * placeholder. One attached image is routinely megabytes of base64 and is
 * useless for triage; images that matter are already GCS-hosted URLs. Mirrors
 * the policy the sessions write path already applies (it tests
 * `!part.url.startsWith('data:')`).
 */
export const MAX_INLINE_DATA_URL_BYTES = 2 * 1024;

/**
 * Hard cap on the serialized snapshot.
 *
 * The service accepts a much larger body (a path-scoped `bodyParser.json`
 * limit, ~25mb, over a 24 MiB server-side snapshot wall), but this stays well
 * under it on purpose:
 *  - whether the Connect/Cloud Run ingress imposes its own lower cap is not
 *    knowable from the client, and a 413 loses the whole report;
 *  - a snapshot past this size is dominated by a handful of giant tool
 *    outputs, while the triage-relevant content is the most recent turns.
 * Raise it via the `maxSnapshotBytes` option rather than editing call sites.
 */
export const DEFAULT_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

/** Byte budget reserved for the synthetic truncation notice. */
const TRUNCATION_NOTICE_RESERVED_BYTES = 512;

/** Stable id of the synthetic message prepended when messages were dropped. */
export const TRUNCATION_NOTICE_MESSAGE_ID = 'feedback-truncation-notice';

export type FeedbackSnapshotOptions = {
  /** Defaults to {@link DEFAULT_MAX_SNAPSHOT_BYTES}. */
  maxSnapshotBytes?: number;
  /** Defaults to {@link MAX_INLINE_DATA_URL_BYTES}. */
  maxInlineDataUrlBytes?: number;
};

/**
 * Serialized size in BYTES, not string length: a snapshot is full of non-ASCII
 * (emoji, CJK, box-drawing in tool output) where `.length` under-counts by up
 * to 3x, and the limit being defended is a byte limit.
 */
const byteSize = (value: unknown): number =>
  new Blob([JSON.stringify(value)]).size;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  // Anything exotic (Date, Map, class instance, null-prototype bag) is left
  // untouched below rather than rebuilt from its enumerable keys, which would
  // quietly destroy it. `JSON.stringify` still handles it at the end.
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype;
};

/**
 * Deep copy with oversized inline `data:` URLs replaced by a placeholder.
 *
 * Walks every value rather than only `part.url` on file parts, because base64
 * also arrives inside tool inputs/outputs and inside `data-*` parts, and those
 * shapes are project-defined and not enumerable here.
 */
const stripInlineDataUrls = (value: unknown, limit: number): unknown => {
  if (typeof value === 'string') {
    if (!value.startsWith('data:')) {
      return value;
    }
    const bytes = new Blob([value]).size;
    if (bytes <= limit) {
      return value;
    }
    return `[omitted: inline data URL, ${bytes} bytes]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripInlineDataUrls(item, limit));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    Object.keys(value).forEach((key) => {
      result[key] = stripInlineDataUrls(value[key], limit);
    });
    return result;
  }

  return value;
};

const buildTruncationNotice = (
  droppedCount: number,
  keptCount: number,
  maxSnapshotBytes: number
): UIMessage => ({
  id: TRUNCATION_NOTICE_MESSAGE_ID,
  role: 'system',
  parts: [
    {
      type: 'text',
      text:
        `[feedback snapshot truncated] ${droppedCount} older message(s) were ` +
        `dropped by the client to fit the ${maxSnapshotBytes} byte snapshot ` +
        `limit. The ${keptCount} most recent message(s) are included ` +
        `verbatim. Oversized inline data: URLs are replaced by placeholders ` +
        `in all messages.`,
    },
  ],
});

/**
 * Returns the array to post as `messages` on `POST feedback/submit`.
 *
 * Pure: never mutates the input (which is `useChat`'s live array).
 *
 * When the snapshot is over the cap, the OLDEST messages are dropped - the
 * complaint is almost always about the latest turns - and a synthetic `system`
 * message is prepended saying so, so a reviewer sees a partial transcript
 * instead of silently mistaking it for a complete one.
 */
export const buildFeedbackSnapshot = (
  messages: UIMessage[],
  options: FeedbackSnapshotOptions = {}
): UIMessage[] => {
  const maxSnapshotBytes =
    options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
  const maxInlineDataUrlBytes =
    options.maxInlineDataUrlBytes ?? MAX_INLINE_DATA_URL_BYTES;

  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const stripped = messages.map(
    (message) =>
      stripInlineDataUrls(message, maxInlineDataUrlBytes) as UIMessage
  );

  if (byteSize(stripped) <= maxSnapshotBytes) {
    return stripped;
  }

  // `JSON.stringify` of an array is exactly `[` + each element + `,` joins +
  // `]`, and Blob sizes are additive over UTF-8, so summing per-message sizes
  // is exact (and one byte conservative) rather than an estimate.
  const sizes = stripped.map((message) => byteSize(message));
  const budget = Math.max(
    0,
    maxSnapshotBytes - TRUNCATION_NOTICE_RESERVED_BYTES
  );

  const kept: UIMessage[] = [];
  let usedBytes = 2; // the enclosing `[` and `]`
  for (let index = stripped.length - 1; index >= 0; index -= 1) {
    const cost = sizes[index] + 1; // element + its `,` separator
    // The newest message is kept unconditionally: a notice-only snapshot has
    // zero triage value, and if that one message really is too big for the
    // service it answers with a 413 the popup surfaces as a readable error.
    if (kept.length > 0 && usedBytes + cost > budget) {
      break;
    }
    usedBytes += cost;
    kept.unshift(stripped[index]);
  }

  const droppedCount = stripped.length - kept.length;
  if (droppedCount === 0) {
    return kept;
  }

  return [
    buildTruncationNotice(droppedCount, kept.length, maxSnapshotBytes),
    ...kept,
  ];
};
