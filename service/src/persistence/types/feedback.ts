/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { DisabledTools, FeatureFlags, TemporaryTable } from './session';
import { isRecord } from './session';

export type FeedbackSnapshotSource = 'client' | 'server';

export interface FeedbackTruncation {
  messageIndex: number;
  messageId?: string;
  path: string;
  reason: 'inline-data-url' | 'comment' | 'system-prompt' | 'snapshot-tail';
  originalBytes: number;
}

/** A message inside a snapshot: any JSON object that looks like a UI message. */
export interface SnapshotMessage {
  id?: string;
  role?: 'user' | 'assistant' | 'system';
  parts?: unknown[];
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Feedback parent record: metadata and the user's comment only (no transcript).
 * No member may rely on `null`: the platform does not store it.
 */
export interface FeedbackRecord {
  id: string;
  sessionId: string;
  /** Verified Identity user id of the submitter. */
  userId: string;
  /** Display-only, client supplied. */
  userLabel?: string;
  comment: string;
  createdAt: number;
  createdAtIso: string;
  snapshotSource: FeedbackSnapshotSource;
  messageCount: number;
  chunkCount: number;
  snapshotBytes: number;
  /** Hex SHA-256 over the UTF-8 bytes of the serialised transcript (change N). */
  snapshotSha256?: string;
  clientMessageCount: number;
  storedMessageCount: number;
  truncated: boolean;
  sessionUserId?: string;
  truncations?: FeedbackTruncation[];
  sessionTitle?: string;
  sessionCreatedAt?: number;
  sessionUpdatedAt?: number;
  systemPrompt?: string;
  disabledTools?: DisabledTools;
  temporaryTables?: TemporaryTable[];
  featureFlags?: FeatureFlags;
  schemaVersion: 1;
}

export interface FeedbackSnapshotChunk {
  /** `<index6>-<chunk3>`, the object key. */
  docId: string;
  index: number;
  chunk: number;
  chunks: number;
  role?: 'user' | 'assistant' | 'system';
  payload: string;
}

export const FEEDBACK_LIST_FIELDS = [
  'id',
  'sessionId',
  'userId',
  'userLabel',
  'comment',
  'createdAt',
  'createdAtIso',
  'messageCount',
  'snapshotSource',
  'snapshotBytes',
  'truncated',
  'sessionTitle',
  'featureFlags',
] as const;

/** The list projection: never the system prompt, disabled tools or transcript. */
export type FeedbackListItem = Pick<
  FeedbackRecord,
  (typeof FEEDBACK_LIST_FIELDS)[number]
>;

export interface FeedbackListFilters {
  authorUserId?: string;
  /** ISO-8601 UTC. */
  createdBefore?: string;
  createdAfter?: string;
}

export function feedbackToValue(r: FeedbackRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...r, schemaVersion: 1 })) as Record<
    string,
    unknown
  >;
}

export function feedbackFromValue(v: unknown): FeedbackRecord | null {
  if (!isRecord(v) || typeof v.id !== 'string') return null;
  return v as unknown as FeedbackRecord;
}

export function feedbackListItem(r: FeedbackRecord): FeedbackListItem {
  const out: Record<string, unknown> = {};
  for (const f of FEEDBACK_LIST_FIELDS) {
    if (r[f] !== undefined) out[f] = r[f];
  }
  return out as unknown as FeedbackListItem;
}
