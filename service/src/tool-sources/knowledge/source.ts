/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import type { Log } from '../../utils/log.types';
import { getMcpTools } from '../mcp-tools';
import type { ToolContext, ToolSource } from '../types';
import {
  KNOWLEDGE_MCP_URL,
  KNOWLEDGE_SOURCE_NAME,
  KNOWLEDGE_TOOLS,
  MENU_HANDSHAKE_TIMEOUT_MS,
} from './constants';
import { tipsBlockOrEmpty, warmTips } from './tips';

/** Warns when the live tool set drifts from the expected list (added or removed tools). */
export const warnOnToolDrift = (live: string[], log: Log): void => {
  const added = live.filter((n) => !KNOWLEDGE_TOOLS.includes(n));
  const removed = KNOWLEDGE_TOOLS.filter((n) => !live.includes(n));
  if (added.length) {
    log.warn(
      `${KNOWLEDGE_SOURCE_NAME} serves tools missing from the expected list: ${added.join(', ')}`
    );
  }
  if (removed.length) {
    log.warn(
      `${KNOWLEDGE_SOURCE_NAME} no longer serves expected tools: ${removed.join(', ')}`
    );
  }
};

const fetchTools = (ctx: ToolContext, timeoutMs: number) =>
  getMcpTools({
    cacheKey: KNOWLEDGE_SOURCE_NAME,
    url: KNOWLEDGE_MCP_URL,
    ttlMs: ctx.config.cache.mcpToolsTtlMs,
    timeoutMs,
    // Fixed, service-controlled host: following a redirect is safe (the SDK default is 'error').
    redirect: 'follow',
    label: KNOWLEDGE_SOURCE_NAME,
    log: ctx.logger,
  });

/**
 * The public commercetools Knowledge MCP (docs, schemata, validation) plus the
 * developer-tips prompt. Needs no configuration, so it is always enabled; a failing
 * endpoint just means no tools for the turn. Session switches are applied by the registry.
 */
export const knowledgeToolSource: ToolSource = {
  name: KNOWLEDGE_SOURCE_NAME,
  displayName: 'commercetools Knowledge',
  description:
    'Official commercetools documentation search plus GraphQL/REST schemata and request validators; use it for API usage, data-model questions and to validate generated queries.',
  kind: 'core',
  routingHints:
    'Keywords: documentation, API, schema, graphql, openapi, oas, validate, query, mutation, how to, error help, what is, explain API.',
  order: 20,
  isEnabled: async () => true,
  getTools: async (ctx): Promise<ToolSet> => {
    const [tools] = await Promise.all([
      fetchTools(ctx, ctx.config.cache.mcpHandshakeTimeoutMs),
      warmTips(ctx.logger),
    ]);
    if (!tools) return {};
    warnOnToolDrift(Object.keys(tools), ctx.logger);
    return tools;
  },
  listForMenu: async (ctx) => {
    const tools = await fetchTools(ctx, MENU_HANDSHAKE_TIMEOUT_MS).catch(
      () => null
    );
    return { toolNames: tools ? Object.keys(tools) : [...KNOWLEDGE_TOOLS] };
  },
  getPrompt: () => tipsBlockOrEmpty(),
};
