/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import { normalizeToolSet } from '../schema/normalize-tool-set';
import type { MenuGroup } from '../services/tool-menu.provider';
import type { DisabledTools } from '../types/chat.types';
import type { ResolvedTools, ToolContext, ToolSource } from './types';

/** Upper bound for ONE source (isEnabled + getTools) before it is skipped. */
export const SOURCE_RESOLVE_TIMEOUT_MS = 15_000;

/** Session sentinel: the whole source is switched off. */
export const ALL_TOOLS = 'all_tools';

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  name: string
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${name} timed out after ${ms} ms`)),
      ms
    );
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

/** Removes the tools the session switched off for this source. */
const applyDisabled = (
  sourceName: string,
  tools: ToolSet,
  disabled: DisabledTools | undefined
): ToolSet => {
  const off = disabled?.[sourceName];
  if (!off || off.length === 0) return tools;
  if (off.includes(ALL_TOOLS)) return {};
  const hidden = new Set(off);
  return Object.fromEntries(
    Object.entries(tools).filter(([toolName]) => !hidden.has(toolName))
  );
};

export interface ResolveOptions {
  /** Only these sources take part (the custom-view orchestrator). */
  only?: readonly string[];
}

export interface ToolSourceRegistry {
  register(...sources: ToolSource[]): void;
  /** Registered sources in merge order. */
  list(): ToolSource[];
  resolve(ctx: ToolContext, options?: ResolveOptions): Promise<ResolvedTools>;
  listMenuGroups(ctx: ToolContext): Promise<MenuGroup[]>;
  listConnectedSourceNames(ctx: ToolContext): Promise<string[]>;
}

const errorReason = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface SettledSource {
  source: ToolSource;
  tools: ToolSet;
}

const resolveSource = async (
  source: ToolSource,
  ctx: ToolContext,
  timeoutMs: number
): Promise<SettledSource> => {
  // `all_tools` switches the whole source off: skip it BEFORE any I/O (no handshake).
  if (ctx.session.disabledTools?.[source.name]?.includes(ALL_TOOLS) === true) {
    return { source, tools: {} as ToolSet };
  }
  try {
    const tools = await withTimeout(
      (async () =>
        (await source.isEnabled(ctx)) ? source.getTools(ctx) : {})(),
      timeoutMs,
      source.name
    );
    return {
      source,
      tools: applyDisabled(source.name, tools, ctx.session.disabledTools),
    };
  } catch (error) {
    ctx.logger.warn(`ToolSource ${source.name} skipped`, {
      reason: errorReason(error),
    });
    return { source, tools: {} as ToolSet };
  }
};

/** Sequential merge in `order`: Promise.all keeps the array order. */
const mergeTools = (
  settled: SettledSource[],
  ctx: ToolContext
): { merged: ToolSet; contributing: ToolSource[] } => {
  const merged: ToolSet = {};
  const owner = new Map<string, string>();
  const contributing: ToolSource[] = [];

  for (const { source, tools } of settled) {
    const names = Object.keys(tools);
    if (names.length === 0) continue;
    for (const name of names) {
      const previous = owner.get(name);
      if (previous !== undefined) {
        ctx.logger.warn(
          `Tool name collision: "${name}" from ${source.name} replaces the one from ${previous}`
        );
      }
      owner.set(name, source.name);
      merged[name] = tools[name];
    }
    contributing.push(source);
  }
  return { merged, contributing };
};

const promptFragment = (source: ToolSource, ctx: ToolContext): string => {
  try {
    return source.getPrompt(ctx);
  } catch (error) {
    ctx.logger.warn(`ToolSource ${source.name} prompt skipped`, {
      reason: errorReason(error),
    });
    return '';
  }
};

/**
 * Prompts are built after the merge, so `ctx.hasTool` answers for the final tool set.
 * Fragment order is still the merge order. The SAME ctx object is passed (a source may
 * key per-request state on it, see identity-mcp), so `hasTool` is set on it for the
 * duration of the prompt loop only.
 */
const buildFragments = (
  ctx: ToolContext,
  merged: ToolSet,
  contributing: ToolSource[]
): string[] => {
  const fragments: string[] = [];
  ctx.hasTool = (name) => Object.prototype.hasOwnProperty.call(merged, name);
  try {
    for (const source of contributing) {
      const fragment = promptFragment(source, ctx);
      if (fragment) {
        fragments.push(`\n\n# ${source.displayName}\n\n${fragment}`);
      }
    }
  } finally {
    delete ctx.hasTool;
  }
  return fragments;
};

const menuGroupFor = async (
  source: ToolSource,
  ctx: ToolContext,
  timeoutMs: number
): Promise<MenuGroup | null> => {
  try {
    const entry = await withTimeout(
      source.listForMenu(ctx),
      timeoutMs,
      source.name
    );
    if (!entry) return null;
    return {
      mcp: source.name,
      toolNames: entry.toolNames,
      ...(entry.unavailableToolNames?.length
        ? { unavailableToolNames: entry.unavailableToolNames }
        : {}),
    };
  } catch (error) {
    ctx.logger.warn(`ToolSource ${source.name} menu skipped`, {
      reason: errorReason(error),
    });
    return null;
  }
};

const connectedNameFor = async (
  source: ToolSource,
  ctx: ToolContext,
  timeoutMs: number
): Promise<string | null> => {
  try {
    const enabled = await withTimeout(
      source.isEnabled(ctx),
      timeoutMs,
      source.name
    );
    return enabled ? source.name : null;
  } catch (error) {
    ctx.logger.warn(`ToolSource ${source.name} skipped`, {
      reason: errorReason(error),
    });
    return null;
  }
};

/**
 * The registry of tool sources (capability tool-source-registry, design D-H1/D-H2).
 *
 * - `resolve` calls every source concurrently, bounds each by `timeoutMs`, treats a throw or a
 *   timeout as "contributes nothing" (warning naming the source) and merges deterministically
 *   in ascending `order` (ties by name), whatever the completion order.
 * - A tool-name collision is won by the later source and logged.
 * - The session's `disabledTools` are applied here, not by the sources.
 * - A prompt fragment is included only for a source that still has a tool after filtering.
 * - Gemini schema normalisation is applied once to the merged set.
 */
export const createToolSourceRegistry = (
  timeoutMs: number = SOURCE_RESOLVE_TIMEOUT_MS
): ToolSourceRegistry => {
  const sources = new Map<string, ToolSource>();

  const register = (...list: ToolSource[]): void => {
    for (const source of list) {
      if (sources.has(source.name)) {
        throw new Error(`Duplicate ToolSource name: ${source.name}`);
      }
      sources.set(source.name, source);
    }
  };

  const list = (): ToolSource[] =>
    [...sources.values()].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name)
    );

  const resolve = async (
    ctx: ToolContext,
    options: ResolveOptions = {}
  ): Promise<ResolvedTools> => {
    const only = options.only ? new Set(options.only) : undefined;
    const taking = list().filter((s) => !only || only.has(s.name));

    const settled = await Promise.all(
      taking.map((source) => resolveSource(source, ctx, timeoutMs))
    );
    const { merged, contributing } = mergeTools(settled, ctx);
    const fragments = buildFragments(ctx, merged, contributing);

    return {
      tools: normalizeToolSet(merged, ctx.logger),
      fragments,
      contributing,
    };
  };

  const listMenuGroups = async (ctx: ToolContext): Promise<MenuGroup[]> => {
    const groups = await Promise.all(
      list().map((source) => menuGroupFor(source, ctx, timeoutMs))
    );
    return groups.filter((group): group is MenuGroup => group !== null);
  };

  const listConnectedSourceNames = async (
    ctx: ToolContext
  ): Promise<string[]> => {
    const names = await Promise.all(
      list()
        .filter((source) => source.kind === 'integration')
        .map((source) => connectedNameFor(source, ctx, timeoutMs))
    );
    return names.filter((name): name is string => name !== null);
  };

  return { register, list, resolve, listMenuGroups, listConnectedSourceNames };
};
