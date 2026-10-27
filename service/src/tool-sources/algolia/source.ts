/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createHash } from 'node:crypto';
import type { ToolSet } from 'ai';
import { getAlgoliaPrompt } from '../../agents/prompts';
import { assertPublicHttpsUrl } from '../../mcp-providers/ssrf';
import { getMcpTools } from '../mcp-tools';
import { ALL_TOOLS } from '../registry';
import type { ToolContext, ToolSource } from '../types';
import { ALGOLIA_SOURCE_NAME, ALGOLIA_TOOLS_TTL_MS } from './constants';

const isConfigured = (ctx: ToolContext): boolean =>
  ctx.config.providers.algolia !== undefined;

/** Never logs the URL: it may embed a key. Only the host of an accepted URL is safe. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid';
  }
};

/**
 * Remote Algolia MCP at the operator-configured URL (`ALGOLIA_MCP_URL`). The group is a
 * single switch (`all_tools`); the registry drops the whole source before any handshake when
 * the session switched it off.
 */
export const algoliaToolSource: ToolSource = {
  name: ALGOLIA_SOURCE_NAME,
  displayName: 'Algolia',
  description:
    'Algolia search indices: run queries, inspect and configure indices, facets and search analytics.',
  kind: 'integration',
  routingHints:
    'Keywords: search, index, algolia, facet, filter, ranking, search configuration.',
  order: 40,
  isEnabled: async (ctx) => isConfigured(ctx),
  getTools: async (ctx): Promise<ToolSet> => {
    const url = ctx.config.providers.algolia?.url.reveal();
    if (!url) return {};
    try {
      // Defence in depth: the section already validated it at startup.
      assertPublicHttpsUrl(url);
    } catch {
      ctx.logger.warn(
        `TOOLSOURCE_FAILED provider=algolia class=InvalidUrl host=${hostOf(url)}`
      );
      return {};
    }
    const tools = await getMcpTools({
      cacheKey: `${ALGOLIA_SOURCE_NAME}:${createHash('sha256').update(url).digest('hex').slice(0, 16)}`,
      url,
      ttlMs: ALGOLIA_TOOLS_TTL_MS,
      timeoutMs: ctx.config.cache.mcpHandshakeTimeoutMs,
      // Operator-supplied URL: never follow a redirect (SSRF hardening).
      redirect: 'error',
      label: ALGOLIA_SOURCE_NAME,
      log: ctx.logger,
    });
    return tools ?? {};
  },
  listForMenu: async (ctx) =>
    isConfigured(ctx) ? { toolNames: [ALL_TOOLS] } : null,
  getPrompt: (ctx) => getAlgoliaPrompt(ctx),
};
