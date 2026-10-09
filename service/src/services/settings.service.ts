/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getContext } from '../context/request-context';
import type { Settings, SettingsStore, ToolCallLogsMode } from '../persistence';

export const TOOL_CALL_LOG_MODE_LIST: readonly ToolCallLogsMode[] = [
  'none',
  'thinking',
  'tools',
  'all',
];

/** Upper bound for the project system prompt (characters). */
export const MAX_SYSTEM_PROMPT_CHARS = 20_000;

export const isToolCallLogsMode = (v: unknown): v is ToolCallLogsMode =>
  TOOL_CALL_LOG_MODE_LIST.some((m) => m === v);

/**
 * The project's single settings object. Reads are memoised in the request context so a
 * handler (or the stream) needing both values reads the object once. Writes change one
 * field and keep every other field (`identityMcp`, `schemaVersion`).
 */
export class SettingsService {
  constructor(private readonly store: SettingsStore) {}

  get(): Promise<Settings> {
    const ctx = getContext();
    if (ctx?.settings) return ctx.settings;
    const pending = this.store.get();
    if (ctx) {
      ctx.settings = pending;
      // A failed read must not stay memoised for the rest of the request.
      pending.catch(() => {
        if (ctx.settings === pending) ctx.settings = undefined;
      });
    }
    return pending;
  }

  async getSystemPrompt(): Promise<string> {
    return (await this.get()).systemPrompt;
  }

  async getToolCallLogs(): Promise<ToolCallLogsMode> {
    return (await this.get()).toolCallLogs;
  }

  async setSystemPrompt(systemPrompt: string): Promise<Settings> {
    return this.write((cur) => ({ ...cur, systemPrompt }));
  }

  async setToolCallLogs(toolCallLogs: ToolCallLogsMode): Promise<Settings> {
    return this.write((cur) => ({ ...cur, toolCallLogs }));
  }

  private async write(mutate: (cur: Settings) => Settings): Promise<Settings> {
    const ctx = getContext();
    const next = await this.store.update(mutate);
    if (ctx) ctx.settings = Promise.resolve(next);
    return next;
  }
}
