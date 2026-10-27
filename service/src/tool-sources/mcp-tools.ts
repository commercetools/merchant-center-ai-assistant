/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createMCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import { CACHE_NS, getCache } from '../cache';
import { describeMcpFailure } from './mcp-failure';
import type { Log } from '../utils/log.types';

/**
 * Best-effort MCP helpers for the Knowledge and Algolia sources: a cache, a handshake
 * deadline, a late handshake that still fills the cache, and `null` instead of throwing.
 * Gemini schema normalisation is NOT done here: the registry normalises the merged set.
 */

/** `'error'` is the secure default for any operator-supplied URL; `'follow'` only for fixed hosts. */
export type McpRedirectMode = 'follow' | 'error';

type McpClientLike = {
  tools(): Promise<ToolSet>;
  experimental_getPrompt(args: { name: string }): Promise<{
    messages?: { content?: { type?: string; text?: string } }[];
  }>;
  close(): Promise<void>;
};

export type McpClientFactory = (config: {
  url: string;
  headers?: Record<string, string>;
  redirect: McpRedirectMode;
}) => Promise<McpClientLike>;

const defaultFactory: McpClientFactory = async ({ url, headers, redirect }) =>
  (await createMCPClient({
    transport: { type: 'http', url, headers, redirect },
    // Both servers these helpers talk to answer the dated protocol versions only: skip the
    // `server/discover` probe (a guaranteed wasted round trip).
    protocolVersionDiscovery: false,
  })) as unknown as McpClientLike;

let factory: McpClientFactory = defaultFactory;

/** Test seam: replace the transport. Call with no argument to restore. */
export const setMcpClientFactoryForTests = (f?: McpClientFactory): void => {
  factory = f ?? defaultFactory;
};

/** Class and HTTP status of a handshake failure; never the message, URL or body. */
const describeFailure = (error: unknown): string => describeMcpFailure(error);

export interface McpToolsParams {
  /** Cache key; must not contain a secret (use a hash of the URL). */
  cacheKey: string;
  url: string;
  ttlMs: number;
  /** Handshake deadline (`MCP_HANDSHAKE_TIMEOUT_MS`); 0 disables it. */
  timeoutMs: number;
  redirect?: McpRedirectMode;
  headers?: Record<string, string>;
  /** Names the source in log lines. */
  label: string;
  log: Log;
}

/**
 * Tools of one MCP server, cached for `ttlMs`. Returns `null` on a failed or slow handshake
 * (callers degrade); a handshake that completes after the deadline still fills the cache.
 */
export async function getMcpTools(
  params: McpToolsParams
): Promise<ToolSet | null> {
  const { cacheKey, url, ttlMs, timeoutMs, headers, label, log } = params;
  const redirect = params.redirect ?? 'error';
  const cache = getCache();

  const cached = await cache.get<ToolSet>(CACHE_NS.MCP_TOOLS, cacheKey);
  if (cached) return cached;

  const t0 = Date.now();
  const handshake = (async () => {
    const client = await factory({ url, headers, redirect });
    const tools = await client.tools();
    await cache.set(CACHE_NS.MCP_TOOLS, cacheKey, tools, ttlMs);
    return tools;
  })().then(
    (tools) => ({ tools }),
    (error: unknown) => ({ error })
  );

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    if (timeoutMs > 0) timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const outcome = await (timeoutMs > 0
      ? Promise.race([handshake, deadline])
      : handshake);
    if (outcome === 'timeout') {
      log.warn(
        `MCP_HANDSHAKE_TIMEOUT source=${label} ms=${timeoutMs} (continuing without its tools)`
      );
      return null;
    }
    if ('error' in outcome) {
      log.warn(
        `MCP_HANDSHAKE_FAILED source=${label} class=${describeFailure(outcome.error)} ms=${Date.now() - t0}`
      );
      return null;
    }
    return outcome.tools;
  } finally {
    clearTimeout(timer);
  }
}

export interface McpPromptParams {
  cacheKey: string;
  url: string;
  name: string;
  ttlMs: number;
  redirect?: McpRedirectMode;
  label: string;
  log: Log;
}

/** Text of a named MCP prompt (cached), or `null` when missing or the handshake fails. */
export async function getMcpPrompt(
  params: McpPromptParams
): Promise<string | null> {
  const { cacheKey, url, name, ttlMs, label, log } = params;
  const cache = getCache();
  const cached = await cache.get<string>(CACHE_NS.MCP_TOOLS, cacheKey);
  if (cached) return cached;

  let client: McpClientLike | undefined;
  const t0 = Date.now();
  try {
    client = await factory({ url, redirect: params.redirect ?? 'error' });
    const result = await client.experimental_getPrompt({ name });
    const text = (result.messages ?? [])
      .map((m) => (m.content?.type === 'text' ? (m.content.text ?? '') : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (!text) {
      log.warn(`MCP_PROMPT_EMPTY source=${label} prompt=${name}`);
      return null;
    }
    await cache.set(CACHE_NS.MCP_TOOLS, cacheKey, text, ttlMs);
    return text;
  } catch (error) {
    log.warn(
      `MCP_PROMPT_FAILED source=${label} prompt=${name} class=${describeFailure(error)} ms=${Date.now() - t0}`
    );
    return null;
  } finally {
    await client?.close().catch(() => undefined);
  }
}
