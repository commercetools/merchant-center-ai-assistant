/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import { RequestBudget } from '../../src/chat/request-budget';
import type { Persistence } from '../../src/persistence';
import type {
  MenuEntry,
  ToolContext,
  ToolSource,
} from '../../src/tool-sources/types';
import type { ChatSession } from '../../src/types/chat.types';
import type { Log } from '../../src/utils/log.types';
import { freshConfig } from './env';
import { makePersistence } from './persistence';

/** Test-only ToolSource: configurable tools, prompt, delay and failure. */
export class StubToolSource implements ToolSource {
  readonly name: string;
  readonly displayName: string;
  readonly description?: string;
  readonly kind?: 'core' | 'integration';
  readonly order: number;
  enabled: boolean;
  menu: MenuEntry | null;
  calls = { isEnabled: 0, getTools: 0 };

  constructor(
    private readonly o: {
      name: string;
      tools?: ToolSet;
      prompt?: string;
      /** Builds the prompt from the context the registry passes (for example `ctx.hasTool`). */
      onPrompt?: (ctx: ToolContext) => string;
      enabled?: boolean;
      delayMs?: number;
      throws?: boolean;
      hangs?: boolean;
      order?: number;
      displayName?: string;
      description?: string;
      kind?: 'core' | 'integration';
      menu?: MenuEntry | null;
    }
  ) {
    this.name = o.name;
    this.displayName = o.displayName ?? o.name;
    this.description = o.description;
    this.kind = o.kind;
    this.order = o.order ?? 100;
    this.enabled = o.enabled ?? true;
    this.menu =
      o.menu === undefined ? { toolNames: Object.keys(o.tools ?? {}) } : o.menu;
  }

  async isEnabled(): Promise<boolean> {
    this.calls.isEnabled += 1;
    return this.enabled;
  }

  async getTools(): Promise<ToolSet> {
    this.calls.getTools += 1;
    if (this.o.hangs) await new Promise(() => undefined);
    if (this.o.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.o.delayMs));
    }
    if (this.o.throws) throw new Error(`${this.name} failed`);
    return this.o.tools ?? {};
  }

  async listForMenu(): Promise<MenuEntry | null> {
    return this.menu;
  }

  getPrompt(ctx?: ToolContext): string {
    if (this.o.onPrompt && ctx) return this.o.onPrompt(ctx);
    return this.o.prompt ?? '';
  }
}

export const fakeLog = (): Log & { messages: string[]; warnings: string[] } => {
  const messages: string[] = [];
  const warnings: string[] = [];
  const record = (m: string) => {
    messages.push(m);
  };
  return {
    messages,
    warnings,
    debug: record,
    info: record,
    warn: (m) => {
      warnings.push(m);
      messages.push(m);
    },
    error: record,
  };
};

/** A ToolContext over in-memory persistence; override any field. */
export const makeToolContext = (
  overrides: Omit<Partial<ToolContext>, 'session'> & {
    session?: Partial<ChatSession>;
  } = {}
): ToolContext & { log: ReturnType<typeof fakeLog>; dispose: () => void } => {
  const log = fakeLog();
  const clientGone = new AbortController();
  const budget =
    overrides.budget ??
    new RequestBudget(Date.now(), 270_000, 30_000, clientGone.signal);
  const stores: Persistence = overrides.stores ?? makePersistence().p;
  const { session: sessionOverrides, ...rest } = overrides;
  const session: ChatSession = {
    id: 's1',
    userId: 'u1',
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 1,
    ...sessionOverrides,
  };
  return {
    user: { userId: 'u1', projectKey: 'p', isAdmin: false },
    sessionId: session.id,
    session,
    locale: 'en',
    projectSystemPrompt: '',
    temporaryTableMessages: [],
    urlReferences: [],
    config: freshConfig(),
    stores,
    abortSignal: budget.hardSignal,
    budget,
    logger: log,
    ...rest,
    log,
    dispose: () => budget.dispose(),
  };
};
