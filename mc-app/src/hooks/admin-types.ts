/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Types moved out of the chat connector for change Q (admin and backoffice surfaces).
// Change Q reshapes them to the service contract of changes G and N (verified user ids,
// display-only user labels); they are kept here as ported so nothing is lost.
import type { UIMessage } from 'ai';
import type { GroupedSessionTools } from './use-chat-service-connector/types';

// System Prompt Configuration Types
export interface GetSystemPromptConfigResponse {
  success: boolean;
  data: { systemPrompt: string };
}

export interface SetSystemPromptConfigResponse {
  success: boolean;
  data: { systemPrompt: string; message: string };
}

// Backoffice Types
export interface BackofficeThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts?: Array<{
    type: string;
    text?: string;
    toolInvocation?: {
      toolName: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  timestamp?: number;
}

export interface BackofficeThread {
  sessionId: string;
  projectKey: string;
  userEmail: string;
  messages: BackofficeThreadMessage[];
}

export interface BackofficeThreadsFilters {
  projectKey?: string;
  userEmail?: string;
  createdAtBefore?: number;
  createdAtAfter?: number;
}

export interface GetBackofficeThreadsResponse {
  success: boolean;
  data: BackofficeThread[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface GetBackofficeThreadMessagesResponse {
  success: boolean;
  data: BackofficeThread;
}

export interface IsAdminResponse {
  success: boolean;
  data: {
    isAdmin: boolean;
  };
}

/**
 * One row of `GET feedback/fetch`. Metadata only - this type deliberately does
 * NOT carry `messages`, which makes it structurally impossible to leak a
 * transcript into the backoffice list table.
 */
export interface FeedbackSummary {
  /** Feedback uuid. Required: uikit `DataTable` keys its rows on this. */
  id: string;
  sessionId: string;
  projectKey: string;
  /** Submitter's email, stored verbatim (case-sensitive) as claimed at submit. */
  userEmail: string;
  /** Possibly `''` - an empty comment is a valid submission. */
  comment: string;
  createdAt: number;
  createdAtIso: string;
  messageCount: number;
  snapshotSource: 'client' | 'server';
  snapshotBytes: number;
  truncated: boolean;
  sessionTitle?: string;
  featureFlags?: {
    customView?: string;
  };
}

/**
 * `GET feedback/fetch/<feedbackId>` - the full record plus the reassembled
 * snapshot. Only this endpoint ever returns `messages`.
 */
export interface FeedbackRecord extends FeedbackSummary {
  messages: UIMessage[];
  /** Number of `snapshot_messages` chunk docs the snapshot was stored across. */
  chunkCount?: number;
  /** Message count in the array the client posted. */
  clientMessageCount?: number;
  /** Message count the server had stored - a mismatch means a partial snapshot. */
  storedMessageCount?: number;
  /** Session owner as recorded server-side; differs from `userEmail` on an admin submit. */
  sessionUserEmail?: string;
  /**
   * Content the server replaced (e.g. inline data URLs). Shape is owned by the
   * service and opaque to the client - render it, don't reach into it.
   */
  truncations?: Array<Record<string, unknown>>;
  sessionCreatedAt?: number;
  sessionUpdatedAt?: number;
  systemPrompt?: string;
  sessionTools?: GroupedSessionTools[];
  temporaryTables?: Array<{
    tableRef: string;
    toolName: string;
    args: string;
    columnNames?: string;
  }>;
}

export interface GetFeedbackEntriesResponse {
  success: boolean;
  data: FeedbackSummary[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  error?: string;
  message?: string;
}

export interface GetFeedbackEntryResponse {
  success: boolean;
  data: FeedbackRecord;
  error?: string;
  message?: string;
}
