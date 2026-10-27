/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Wire types of the admin surfaces: system prompt, MCP provider status, backoffice and
// feedback review. They follow the service routes listed in docs/api.md.
//
// Identity: every row carries the gateway-verified `userId`. `userLabel` is a display-only
// text the browser supplied; it is shown tagged "(unverified)" and never used to filter,
// join or decide anything.
import type { UIMessage } from 'ai';

// System Prompt Configuration Types
export interface GetSystemPromptConfigResponse {
  success: boolean;
  data: { systemPrompt: string };
}

export interface SetSystemPromptConfigResponse {
  success: boolean;
  data: { systemPrompt: string; message: string };
}

// MCP provider status (`GET mcp/providers`). Names and booleans only, never a value.
export type McpProviderName = 'contentstack' | 'algolia' | 'stripe';

export interface McpProviderStatus {
  provider: McpProviderName;
  configured: boolean;
  enabled: boolean;
  missingKeys: string[];
}

export interface GetMcpProvidersResponse {
  success: boolean;
  data: McpProviderStatus[];
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
  /** Gateway-verified user id of the session owner. */
  userId: string;
  /** Display-only, unverified. */
  userLabel?: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  messages: BackofficeThreadMessage[];
  /** True when the service cut the transcript at its message cap. */
  truncated?: boolean;
}

export interface BackofficeThreadsFilters {
  userId?: string;
  createdAtBefore?: number;
  createdAtAfter?: number;
}

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface GetBackofficeThreadsResponse {
  success: boolean;
  data: BackofficeThread[];
  pagination: Pagination;
}

export interface GetBackofficeThreadMessagesResponse {
  success: boolean;
  data: BackofficeThread;
}

/**
 * One row of `GET feedback/fetch`. Metadata only - this type deliberately does
 * NOT carry `messages`, which makes it structurally impossible to leak a
 * transcript into the backoffice list table.
 */
export interface FeedbackSummary {
  /** Feedback uuid. Required: the table keys its rows on this. */
  id: string;
  sessionId: string;
  /** Gateway-verified user id of the submitter. */
  userId: string;
  /** Display-only, unverified. */
  userLabel?: string;
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
  /** False when the snapshot could not be reassembled completely. */
  snapshotIntact?: boolean;
  /** Number of chunks the snapshot was stored across. */
  chunkCount?: number;
  /** Message count in the array the client posted. */
  clientMessageCount?: number;
  /** Message count the server had stored - a mismatch means a partial snapshot. */
  storedMessageCount?: number;
  /** Verified user id of the session owner; differs from `userId` on an admin submit. */
  sessionUserId?: string;
  /**
   * Content the server replaced (e.g. inline data URLs). Shape is owned by the
   * service and opaque to the client - render it, don't reach into it.
   */
  truncations?: Array<Record<string, unknown>>;
  sessionCreatedAt?: number;
  sessionUpdatedAt?: number;
  systemPrompt?: string;
  /** Tools the user turned off, keyed by tool group. */
  disabledTools?: Record<string, string[]>;
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
  pagination: Pagination;
  error?: string;
  message?: string;
}

export interface GetFeedbackEntryResponse {
  success: boolean;
  data: FeedbackRecord;
  error?: string;
  message?: string;
}
