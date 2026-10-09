/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet, UIMessage } from 'ai';
import type { RequestBudget } from '../chat/request-budget';
import type { AppConfig } from '../config';
import type { Persistence } from '../persistence';
import type { ChatSession } from '../types/chat.types';
import type { RequestUser } from '../types/request.types';
import type { Log } from '../utils/log.types';
import type { UrlReference } from '../utils/url-references';

/**
 * Everything a tool source may need to answer for ONE chat turn (or one menu request).
 * Built per request by `chat/context.ts`; never cached across requests.
 */
export interface ToolContext {
  /** Verified identity (change D). The only identity there is. */
  user: RequestUser;
  sessionId: string;
  /** Loaded once per request. */
  session: ChatSession;
  /** Request locale, default `en`. */
  locale: string;
  /** From the settings object; written by an administrator. */
  projectSystemPrompt: string;
  temporaryTableMessages: string[];
  urlReferences: UrlReference[];
  config: AppConfig;
  stores: Persistence;
  /** Hard budget + client disconnect: aborts when the whole turn has to stop. */
  abortSignal: AbortSignal;
  /** Soft/hard deadlines (capability request-time-budget). */
  budget: RequestBudget;
  logger: Log;
  /**
   * Only set while `getPrompt` runs: true when the MERGED tool set of this turn (after
   * `disabledTools` and name collisions) contains a tool of that name. Lets a prompt mention
   * only tools that exist, for example the Nimbus lookup tools. Absent in `isEnabled`,
   * `getTools` and `listForMenu`, where the merged set is not known yet.
   */
  hasTool?: (name: string) => boolean;
}

/** What a source shows in the per-session tools menu. */
export interface MenuEntry {
  toolNames: string[];
  /**
   * Names in `toolNames` that no tool backs in the pinned toolkit version (the switch would
   * change nothing). They stay in the menu and are marked `available: false` in the response.
   */
  unavailableToolNames?: string[];
}

/**
 * One provider of tools + prompt + menu entry: the plug-in point of changes I-M.
 *
 * `name` is simultaneously the registry key, the tools-menu group id
 * (`GroupedSessionTools.mcp`) and the key under which the session stores `disabledTools`. It
 * MUST be unique, lower-case kebab or camel, and stable across releases.
 *
 * The registry (not the source) takes care of: the 15 s timeout, failure isolation, the
 * session's `disabledTools`, Gemini schema normalisation, prompt gating and merge order. A
 * source only answers "how do I get my tools".
 */
export interface ToolSource {
  readonly name: string;
  readonly displayName: string;
  /** One line shown to the orchestrator in the generated preamble. Optional. */
  readonly description?: string;
  /**
   * Optional routing hints for the generated preamble: keywords that point to this source and
   * prerequisites such as "fetch the data first". Replaces the legacy keyword table.
   */
  readonly routingHints?: string;
  /**
   * `core`: always-on built-in tools. `integration`: an optional external data source; only
   * integrations count as "connected sources" for the suggestions prompt. Omitted = not an
   * integration.
   */
  readonly kind?: 'core' | 'integration';
  /** Ascending merge order; ties broken by name. */
  readonly order: number;
  /** false => contributes nothing. Never throws. */
  isEnabled(ctx: ToolContext): Promise<boolean>;
  /** The keys are the tool names shown in the menu. */
  getTools(ctx: ToolContext): Promise<ToolSet>;
  /** null => no menu group. Independent of `isEnabled`. */
  listForMenu(ctx: ToolContext): Promise<MenuEntry | null>;
  /** '' when none; MUST NOT embed the project system prompt (the orchestrator adds it once). */
  getPrompt(ctx: ToolContext): string;
}

/** What `registry.resolve` returns. */
export interface ResolvedTools {
  /** Merged, filtered by `disabledTools`, Gemini-normalised. */
  tools: ToolSet;
  /** Prompt fragments of the contributing sources, in merge order. */
  fragments: string[];
  /** Sources that contributed at least one tool, in merge order. */
  contributing: ToolSource[];
}

/**
 * Uploads generated images (provided by change L). `upload` returns what is stored in the
 * file part: the public bucket URL, or in `private` mode a service-relative `/files/...` path.
 */
export interface ImageUploader {
  upload(
    bytes: Uint8Array,
    mediaType: string,
    sessionId: string
  ): Promise<string>;
  /**
   * Converts stored file parts that carry service-relative `/files/...` URLs into base64 data
   * so a relative URL never reaches the model. Optional: without it messages pass unchanged.
   */
  toModelMessages?(
    messages: UIMessage[],
    context?: { sessionId: string }
  ): Promise<UIMessage[]>;
}
