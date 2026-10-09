/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { StripeAgentToolkit } from '@stripe/agent-toolkit/ai-sdk';
import type { ToolSet } from 'ai';
import { getStripePrompt } from '../../agents/prompts';
import { adaptLegacyToolSet } from '../../schema/legacy-tool-schema';
import { logSourceFailure } from '../safe-log';
import type { ToolContext, ToolSource } from '../types';
import {
  STRIPE_FOLLOWS,
  STRIPE_SOURCE_NAME,
  STRIPE_TOOL_NAME_BY_KEY,
  STRIPE_TOOLS,
} from './constants';

type ActionMap = Record<string, Record<string, true>>;

/** The part of the toolkit the source uses; also the test seam. */
export interface StripeToolkitLike {
  tools: Record<string, unknown>;
}
export type StripeToolkitFactory = (args: {
  secretKey: string;
  configuration: { actions: ActionMap; context?: { account: string } };
}) => StripeToolkitLike;

const defaultFactory: StripeToolkitFactory = (args) =>
  new StripeAgentToolkit(
    args as ConstructorParameters<typeof StripeAgentToolkit>[0]
  ) as unknown as StripeToolkitLike;

let factory: StripeToolkitFactory = defaultFactory;
let memo: { secretKey: string; account?: string; tools: ToolSet } | null = null;

/** Test seam: replace the toolkit constructor and forget the memoised tool set. */
export const setStripeToolkitFactoryForTests = (
  f?: StripeToolkitFactory
): void => {
  factory = f ?? defaultFactory;
  memo = null;
};

/** `resource.action` list -> `{ resource: { action: true } }` as the toolkit expects. */
export const toActions = (names: readonly string[]): ActionMap => {
  const actions: ActionMap = {};
  for (const name of names) {
    const [resource, action] = name.split('.');
    if (resource && action) {
      actions[resource] = { ...(actions[resource] ?? {}), [action]: true };
    }
  }
  return actions;
};

/**
 * The toolkit's tool set, renamed to menu names and adapted to ai 7 / zod 4. Always ALL
 * 24 actions: the registry removes session-disabled tools afterwards. One toolkit per
 * process, because the configuration only changes with a redeploy.
 */
export const buildStripeTools = (
  secretKey: string,
  connectedAccountId: string | undefined,
  ctx: Pick<ToolContext, 'logger'>
): ToolSet => {
  if (
    memo &&
    memo.secretKey === secretKey &&
    memo.account === connectedAccountId
  ) {
    return memo.tools;
  }
  const toolkit = factory({
    secretKey,
    configuration: {
      actions: toActions(STRIPE_TOOLS),
      ...(connectedAccountId && { context: { account: connectedAccountId } }),
    },
  });
  const adapted = adaptLegacyToolSet(toolkit.tools);
  const tools: ToolSet = {};
  for (const [key, tool] of Object.entries(adapted)) {
    const name = STRIPE_TOOL_NAME_BY_KEY[key];
    if (!name) {
      // Unknown to the pinned map: never expose a tool the menu cannot switch off.
      ctx.logger.warn(`STRIPE_TOOL_UNMAPPED key=${key} (dropped)`);
      continue;
    }
    tools[name] = tool;
  }
  memo = { secretKey, account: connectedAccountId, tools };
  return tools;
};

/** Removes tools that follow the switch of a disabled menu entry (`subscriptions.cancel`). */
const dropFollowers = (tools: ToolSet, disabled: string[]): ToolSet => {
  const result: ToolSet = { ...tools };
  for (const [follower, parent] of Object.entries(STRIPE_FOLLOWS)) {
    if (disabled.includes(parent)) delete result[follower];
  }
  return result;
};

const isConfigured = (ctx: ToolContext): boolean =>
  ctx.config.providers.stripe !== undefined;

/**
 * Stripe agent toolkit running in-process with the deployment's `STRIPE_SECRET_KEY` (and
 * optional connected account). Recommend a restricted key limited to the wanted tools.
 */
export const stripeToolSource: ToolSource = {
  name: STRIPE_SOURCE_NAME,
  displayName: 'Stripe',
  description:
    'Stripe payments: customers, invoices, subscriptions, refunds, disputes, payment links, prices, coupons, balance and Stripe documentation search.',
  kind: 'integration',
  order: 50,
  isEnabled: async (ctx) => isConfigured(ctx),
  getTools: async (ctx): Promise<ToolSet> => {
    const cfg = ctx.config.providers.stripe;
    if (!cfg) return {};
    const t0 = Date.now();
    try {
      const tools = buildStripeTools(
        cfg.secretKey.reveal(),
        cfg.connectedAccountId,
        ctx
      );
      return dropFollowers(
        tools,
        ctx.session.disabledTools?.[STRIPE_SOURCE_NAME] ?? []
      );
    } catch (error) {
      // Class only: errors can echo parts of a request, including the key.
      logSourceFailure(ctx.logger, STRIPE_SOURCE_NAME, error, t0);
      return {};
    }
  },
  listForMenu: async (ctx) =>
    isConfigured(ctx) ? { toolNames: [...STRIPE_TOOLS] } : null,
  getPrompt: (ctx) => getStripePrompt(ctx),
};
