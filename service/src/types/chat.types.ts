/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type {
  DisabledTools,
  FeatureFlags,
  NextPrompt,
  SessionRecord,
  TemporaryTable,
} from '../persistence';

export type { DisabledTools, FeatureFlags, NextPrompt, TemporaryTable };
export type { PromptSuggestion, UserSuggestions } from '../persistence';

/** The session as stored and as returned by the API (no tenant or e-mail fields). */
export type ChatSession = SessionRecord;
export type { SessionRecord };

/**
 * Feature flags as they arrive on a request: any non-reserved query parameter.
 * `customView` (base64 Merchant Center URL) is the only one the product uses.
 */
export type RequestFeatureFlags = Record<string, string | boolean>;

export type SessionTool = {
  toolName: string;
  enabled: boolean;
};

export type GroupedSessionTools = {
  mcp: string;
  tools: SessionTool[];
};

/** A stored message as the API returns it (AI SDK UI message shape). */
export type AiSdkChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: unknown[];
  timestamp?: number;
};

/** What one turn's digest produces; see the session-digest capability. */
export type SessionDigest = {
  title: string;
  description: string;
  /** A Material Symbols name from `DIGEST_ICON_NAMES`. */
  icon: string;
  summary: string;
  nextPrompts: NextPrompt[];
};

/** One row of `GET /service/session/all`. */
export type SessionListItem = {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
  featureFlags?: FeatureFlags;
};

export type CreateSessionRequest = {
  title?: string;
  metadata?: Record<string, unknown>;
  featureFlags?: RequestFeatureFlags;
  /** Display-only, unverified; sanitised before it is stored. */
  userLabel?: string;
};
