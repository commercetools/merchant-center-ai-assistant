/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Tool, ToolSet } from 'ai';
import { getContentstackPrompt } from '../../agents/prompts';
import type { ToolContext, ToolSource } from '../types';
import { ContentstackClient, type FetchImpl } from './client';
import { CONTENTSTACK_SOURCE_NAME, CONTENTSTACK_TOOLS } from './constants';
import { contentTypeTools } from './tools-content-type';
import { entryTools } from './tools-entry';
import { globalFieldTools } from './tools-global-field';
import { readTools } from './tools-read';

let fetchImplForTests: FetchImpl | undefined;

/** Test seam: route every Contentstack request through a stub. */
export const setContentstackFetchForTests = (f?: FetchImpl): void => {
  fetchImplForTests = f;
};

/** All 15 tools over one client (the registry filters by session; the source never does). */
export const buildContentstackTools = (client: ContentstackClient): ToolSet => {
  const all: Record<string, Tool> = {
    ...contentTypeTools(client),
    ...entryTools(client),
    ...globalFieldTools(client),
    ...readTools(client),
  };
  return Object.fromEntries(
    CONTENTSTACK_TOOLS.map((name) => [name, all[name]])
  ) as ToolSet;
};

const isConfigured = (ctx: ToolContext): boolean =>
  ctx.config.providers.contentstack !== undefined;

/**
 * Contentstack Content Management API (15 tools) with the stack key and management token of
 * the deployment configuration. Advise operators to scope the token to what the assistant
 * may change.
 */
export const contentstackToolSource: ToolSource = {
  name: CONTENTSTACK_SOURCE_NAME,
  displayName: 'Contentstack',
  description:
    'Contentstack CMS: read, create, update, delete and publish content types, entries and global fields.',
  kind: 'integration',
  routingHints:
    'Keywords: content, CMS, entry, content type, publish, asset, article, blog, page content.',
  order: 30,
  isEnabled: async (ctx) => isConfigured(ctx),
  getTools: async (ctx): Promise<ToolSet> => {
    const cfg = ctx.config.providers.contentstack;
    if (!cfg) return {};
    return buildContentstackTools(
      new ContentstackClient({
        apiKey: cfg.apiKey.reveal(),
        managementToken: cfg.managementToken.reveal(),
        branch: cfg.branch,
        region: cfg.region,
        fetchImpl: fetchImplForTests,
      })
    );
  },
  listForMenu: async (ctx) =>
    isConfigured(ctx) ? { toolNames: [...CONTENTSTACK_TOOLS] } : null,
  getPrompt: (ctx) => getContentstackPrompt(ctx),
};
