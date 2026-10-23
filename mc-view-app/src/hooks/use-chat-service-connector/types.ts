/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/hooks/use-chat-service-connector/types.ts, pruned to the panel.
import type { UIMessage } from 'ai';
import type { FeatureFlags } from '../../utils/feature-flags';

export interface CreateSessionRequest {
  title?: string;
  /** The `customView` flag: scopes the session to the host page. */
  featureFlags?: FeatureFlags;
}

export interface ChatSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
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
  /** AI SDK `UIMessage`s, fed straight into `useChat` as the initial messages. */
  data: UIMessage[];
  /** True when the service answered 404: the stored session id no longer exists. */
  notFound?: boolean;
}

/** One row of `GET session/all`. */
export interface SessionSummary {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** One card in the empty state. `prompt` is what is sent when the card is picked. */
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
    /** `false` when these are the service's static defaults. */
    personalised: boolean;
  };
}

export interface GetAllSessionsSummaryResponse {
  success: boolean;
  data: SessionSummary[];
}

export type ToolCallLogsMode = 'none' | 'thinking' | 'tools' | 'all';

export interface GetToolCallLogsConfigResponse {
  success: boolean;
  data: { mode: ToolCallLogsMode };
}
