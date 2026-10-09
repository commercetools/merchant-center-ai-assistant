/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { FeedbackSnapshotChunk, SnapshotMessage } from '../../src/persistence';
import {
  buildSnapshot,
  reassemble,
  snapshotChunkKey,
} from '../../src/utils/feedback-snapshot';

/** Chunks exactly as `feedback.service.ts` stores them (change N's whole-transcript snapshot). */
export const snapshotChunks = (
  feedbackId: string,
  messages: SnapshotMessage[],
  maxChunkBytes?: number
): { chunks: FeedbackSnapshotChunk[]; sha256: string } => {
  const built = buildSnapshot(messages, maxChunkBytes);
  return {
    sha256: built.sha256,
    chunks: built.payloads.map((payload, ordinal) => ({
      docId: snapshotChunkKey(feedbackId, ordinal),
      index: ordinal,
      chunk: 0,
      chunks: built.chunkCount,
      payload,
    })),
  };
};

/** Reads the stored chunks back the way the review path does (digest verified). */
export const readTranscript = (
  parts: { chunks: Array<{ payload: string }> },
  sha256: string
): { messages: SnapshotMessage[]; intact: boolean } =>
  reassemble({
    payloads: parts.chunks.map((c) => c.payload),
    expectedChunkCount: parts.chunks.length,
    sha256,
  });
