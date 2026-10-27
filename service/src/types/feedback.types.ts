/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  FeedbackListItem,
  FeedbackRecord,
  FeedbackSnapshotSource,
  FeedbackTruncation,
  SnapshotMessage,
} from '../persistence/types/feedback';

export type {
  FeedbackListItem,
  FeedbackRecord,
  FeedbackSnapshotSource,
  FeedbackTruncation,
  SnapshotMessage,
};

/** Body of `POST /service/feedback/submit`. Everything is untrusted browser input. */
export interface FeedbackSubmitBody {
  sessionId?: unknown;
  comment?: unknown;
  messages?: unknown;
  /** Display-only, sanitised, unverified. */
  userLabel?: unknown;
}

/** 201 payload; never echoes the snapshot. */
export interface FeedbackSubmitResult {
  id: string;
  createdAt: number;
  messageCount: number;
  snapshotSource: FeedbackSnapshotSource;
  truncated: boolean;
  snapshotBytes: number;
}

/** Filters of the review list. Dates are epoch milliseconds. */
export interface FeedbackListQuery {
  authorUserId?: string;
  createdAtBefore?: number;
  createdAtAfter?: number;
}

/** A record plus its reassembled transcript. */
export type FeedbackDetail = FeedbackRecord & {
  messages: SnapshotMessage[];
  snapshotIntact: boolean;
};

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

/** Outcome of a service call; routes map it to an HTTP answer. */
export type ServiceResult<T> =
  | { status: 200 | 201; data: T }
  | { status: 400 | 404 | 413; error: string; message?: string };

/** One user's session with its messages, as shown to administrators. */
export interface BackofficeThread {
  sessionId: string;
  userId: string;
  /** Display-only, unverified. */
  userLabel?: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    parts: unknown[];
    timestamp: number;
  }>;
  truncated: boolean;
}

export interface BackofficeFilters {
  userId?: string;
  createdAtBefore?: number;
  createdAtAfter?: number;
}
