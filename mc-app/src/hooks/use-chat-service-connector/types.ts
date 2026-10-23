/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// API Types based on service routes - Updated to match backend implementation
import type { UIMessage } from 'ai';

export interface CreateSessionRequest {
  title?: string;
  /**
   * Display-only label (the signed-in user's e-mail). Unverified: the service sanitises it
   * and never uses it for authorization, ownership or filtering. Body field only.
   */
  userLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  content: string;
  sender: 'user' | 'system';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionResponse {
  success: boolean;
  data: ChatSession;
}

export interface GetSessionResponse {
  success: boolean;
  data: ChatSession;
}

export interface GetMessagesResponse {
  success: boolean;
  /**
   * AI SDK `UIMessage`s, NOT the local `ChatMessage` shape above. The service stores and
   * returns what `useChat` consumes (`role` + `parts`), and this is fed straight into it
   * as `initialMessages`. The declaration said `ChatMessage[]` while nothing type-checked
   * against it; it is corrected here rather than left to mislead the next reader.
   */
  data: UIMessage[];
  /**
   * True when the service answered 404, i.e. the session id does not exist for this
   * project and user. This is how a stale `localStorage` id is detected now that the app
   * no longer spends a round trip validating one before asking for its messages - see
   * `SessionProvider.initializeSessionFromStorage`. Distinct from a generic
   * `success: false`, which must NOT discard the stored session.
   */
  notFound?: boolean;
}

export interface GetSessionsResponse {
  success: boolean;
  data: ChatSession[];
}

/**
 * One row of `GET session/all`.
 *
 * `description` and `icon` come from the session digest, which the service writes after
 * each completed turn. They are optional because a session only has them once its first
 * turn has finished, and sessions created before the digest existed will never have them -
 * those rows fall back to a truncated first message for the title, no description, and the
 * client's default icon.
 */
export interface SessionSummary {
  id: string;
  title: string;
  description?: string;
  /** Material Symbols name; resolve with `utils/material-icons`. */
  icon?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * One card in the empty state's "Start with" grid. `prompt` is what gets sent when the
 * card is picked, which is why it differs from the visible `title`.
 */
export interface PromptSuggestion {
  /** Material Symbols name; resolve with `utils/material-icons`. */
  icon: string;
  title: string;
  detail: string;
  prompt: string;
}

/** One follow-up chip. `text` is the label; `prompt` is the message it sends. */
export interface NextPrompt {
  text: string;
  prompt: string;
}

/**
 * `GET session/:id/digest`. `pending` means the service has not finished digesting the
 * turn yet - it is a normal, expected answer, not an error.
 */
/** The digest projection itself, shared by the endpoint and the session bootstrap. */
export type SessionDigest =
  | { pending: true }
  | {
      pending: false;
      digestUpdatedAt: number;
      title?: string;
      description?: string;
      icon?: string;
      nextPrompts?: NextPrompt[];
    };

export interface GetSessionDigestResponse {
  success: boolean;
  data:
    | { pending: true }
    | {
        pending: false;
        digestUpdatedAt: number;
        title?: string;
        description?: string;
        icon?: string;
        nextPrompts: NextPrompt[];
      };
}

export interface GetSuggestionsResponse {
  success: boolean;
  data: {
    suggestions: PromptSuggestion[];
    /** `false` when these are the service's static defaults rather than personalised. */
    personalised: boolean;
  };
}

export interface GetAllSessionsSummaryResponse {
  success: boolean;
  data: SessionSummary[];
}

export interface DeleteSessionResponse {
  success: boolean;
  message: string;
}

export interface UpdateSessionRequest {
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionResponse {
  success: boolean;
  data: ChatSession;
}

export interface DeleteMessageResponse {
  success: boolean;
  message: string;
}

export interface GetStatsResponse {
  success: boolean;
  data: {
    sessionsCount: number;
    messagesCount: number;
    totalSize: string;
  };
}

export interface ChatServiceError {
  success: false;
  error: string;
  message?: string;
}

// Session Tools Types
export interface SessionTool {
  toolName: string;
  enabled: boolean;
}

export interface GroupedSessionTools {
  /** Tool provider id, e.g. `commercetools`; the service owns the list. */
  mcp: string;
  tools: SessionTool[];
}

export interface GetSessionToolsResponse {
  success: boolean;
  data: GroupedSessionTools[];
}

export interface UpdateSessionToolsRequest {
  tools: GroupedSessionTools[];
}

export interface UpdateSessionToolsResponse {
  success: boolean;
  data: GroupedSessionTools[];
}

// Tool Call Logs Configuration Types
export type ToolCallLogsMode = 'none' | 'thinking' | 'tools' | 'all';

export interface ToolCallLogsConfig {
  mode: ToolCallLogsMode;
}

export interface GetToolCallLogsConfigResponse {
  success: boolean;
  data: ToolCallLogsConfig;
}

export interface SetToolCallLogsConfigResponse {
  success: boolean;
  data: {
    mode: ToolCallLogsMode;
    message: string;
  };
}

// Feedback Types
// Wire contract (base = chatServiceEndpointUrl, which always ends in '/'):
//   POST feedback/submit -> SubmitFeedbackResponse
// The caller's identity is the verified user id of the gateway token; nothing about the
// caller is sent in the URL. There is deliberately no `rating` and no `status` field.
export interface SubmitFeedbackRequest {
  sessionId: string;
  /**
   * Optional free-text comment. An EMPTY comment is a VALID submission - it is
   * a legitimate "the whole session was bad" signal, so submit is never
   * disabled for it. The server stores `''`, never `undefined`.
   */
  comment?: string;
  /**
   * The client's in-memory `useChat` array, which is the only place reasoning
   * parts and most tool calls exist (the server strips them before storing).
   * If omitted or empty the server falls back to the stored transcript and
   * records `snapshotSource: 'server'`.
   */
  messages?: UIMessage[];
  /** Display-only, unverified label for the backoffice (body field only). */
  userLabel?: string;
}

export interface SubmitFeedbackResponse {
  success: boolean;
  data?: {
    id: string;
    createdAt: number;
    messageCount: number;
    snapshotSource: 'client' | 'server';
    truncated: boolean;
    snapshotBytes: number;
  };
  error?: string;
  message?: string;
}
