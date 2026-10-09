/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool } from 'ai';
import type { ToolSet } from 'ai';
import { z } from 'zod';
import { getCommercetoolsPrompt } from '../agents/prompts/commercetools.prompt';
import type { ToolContext, ToolSource } from '../tool-sources/types';
import { createIdentityStores } from './adapters/persistence';
import { readIdentityConnection } from './connection';
import { COMMERCETOOLS_SOURCE_NAME } from './constants';
import {
  IdentityNoPermittedToolsError,
  IdentityReauthRequiredError,
} from './errors';
import { withToolResultPipeline } from '../analytics/pipeline/pipeline';
import { getFetchOverride } from './runtime';
import { getIdentityMcpToolSet } from './toolset';
import type { IdentityToolSetDeps } from './toolset';

/**
 * The `commercetools` ToolSource: the signed-in user's own Merchant Center permissions decide
 * which tools the Managed MCP Server (identity mode) exposes.
 *
 * `commercetools` (change I) and the documentation-lookup source (another change) are two independent
 * sources with separate menu groups; the orchestrators merge them (the custom-view
 * orchestrator selects exactly these two). Do not merge them here.
 *
 * The registry (change H) owns the 15 s timeout, failure isolation, the session's
 * `disabledTools`, Gemini schema normalisation and prompt gating; this source only answers
 * "how do I get this user's tools".
 */

type Problem = 'reauth' | 'no-permitted';

/** Per-request state shared by `getTools` and `getPrompt` (the registry passes the same ctx). */
const problems = new WeakMap<ToolContext, Problem>();

export const NOT_CONNECTED_TOOL = 'commercetools_account_not_connected';

const RECONNECT_FRAGMENT: Record<Problem, string> = {
  reauth:
    "\n\n## ACCOUNT NOT CONNECTED\nThe user's commercetools account is not connected to this assistant " +
    '(or the connection expired). You cannot access their commerce data right now. Tell them to use ' +
    'the "Connect my account" button and then ask again. Do not guess or invent commerce data.',
  'no-permitted':
    '\n\n## NO PERMITTED TOOLS\nThe Merchant Center permissions of this user allow none of the tools ' +
    'configured on the commercetools MCP Server. Tell them to ask an administrator for access. ' +
    'Do not guess or invent commerce data.',
};

const notConnectedTool = (code: string, problem: Problem) =>
  tool({
    description:
      "Reports that the user's commercetools account is not connected or has no permitted tools. " +
      'Call it if you need commerce data.',
    inputSchema: z.object({}),
    execute: async () => ({
      success: false,
      code,
      message:
        problem === 'reauth'
          ? "The user's commercetools account is not connected (or the connection expired). " +
            'Tell them to use the Connect my account button, then retry.'
          : 'The Merchant Center permissions of this user allow none of the configured tools. ' +
            'Tell them to ask an administrator for access.',
    }),
  });

const depsOf = (ctx: ToolContext): IdentityToolSetDeps => ({
  config: ctx.config,
  stores: createIdentityStores(ctx.stores),
  fetchFn: getFetchOverride(),
});

export const commercetoolsToolSource: ToolSource = {
  name: COMMERCETOOLS_SOURCE_NAME,
  displayName: 'commercetools Commerce',
  description:
    'Reads and manages commerce data (products, orders, customers, carts, inventory, discounts) ' +
    "of the user's Project. The tools offered depend on the user's Merchant Center permissions.",
  kind: 'core',
  routingHints:
    'Keywords: product, order, customer, cart, inventory, discount, price, category, sku, variant, shipping, tax. Fetch commerce data here first before charting or exporting it.',
  order: 10,

  isEnabled: async (ctx) => Boolean(await depsOf(ctx).stores.binding.get()),

  getTools: async (ctx): Promise<ToolSet> => {
    const deps = depsOf(ctx);
    const binding = await deps.stores.binding.get();
    if (!binding) return {};
    const userId = ctx.user.userId;
    try {
      const result = await getIdentityMcpToolSet(userId, binding, deps);
      if (!result) return {};
      // ALL tools of the user's set; filtering by `disabledTools` is the registry's job.
      return withToolResultPipeline(result.tools, {
        sessionId: ctx.sessionId,
        userId,
      });
    } catch (error) {
      if (error instanceof IdentityReauthRequiredError) {
        problems.set(ctx, 'reauth');
        return {
          [NOT_CONNECTED_TOOL]: notConnectedTool(
            'IDENTITY_REAUTH_REQUIRED',
            'reauth'
          ),
        };
      }
      if (error instanceof IdentityNoPermittedToolsError) {
        problems.set(ctx, 'no-permitted');
        return {
          [NOT_CONNECTED_TOOL]: notConnectedTool(
            'IDENTITY_NO_PERMITTED_TOOLS',
            'no-permitted'
          ),
        };
      }
      throw error; // the registry isolates it
    }
  },

  listForMenu: async (ctx) => {
    const deps = depsOf(ctx);
    // A cheap metadata check first: no handshake for a user who never connected. The group
    // is still shown (empty) so the UI can offer to connect.
    const connection = await readIdentityConnection(
      deps.stores,
      ctx.user.userId
    );
    if (!connection.binding) return null;
    if (!connection.connected) return { toolNames: [] };
    try {
      const result = await getIdentityMcpToolSet(
        ctx.user.userId,
        connection.binding,
        deps
      );
      return { toolNames: result ? result.toolNames : [] };
    } catch (error) {
      if (
        error instanceof IdentityReauthRequiredError ||
        error instanceof IdentityNoPermittedToolsError
      ) {
        return { toolNames: [] };
      }
      throw error;
    }
  },

  getPrompt: (ctx) => {
    const problem = problems.get(ctx);
    return (
      getCommercetoolsPrompt(ctx) + (problem ? RECONNECT_FRAGMENT[problem] : '')
    );
  },
};
