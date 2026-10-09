/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
  type ToolSet,
} from 'ai';
import { getProjectSystemPromptSection } from '../agents/prompts';
import { getModel, getProviderOptions } from '../llm';
import type { ToolSourceRegistry } from '../tool-sources/registry';
import type { ToolContext } from '../tool-sources/types';
import {
  budgetExhausted,
  withSoftAbort,
  wrapUpPrepareStep,
} from './budget-tools';
import { CHAT_MAX_STEPS } from './constants';
import { buildPreamble } from './preamble';

type ProviderOptions = ReturnType<typeof getProviderOptions>;

export interface ChatModel {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}

const defaultChatModel = (): ChatModel => ({
  model: getModel('main'),
  providerOptions: getProviderOptions('main'),
});

let chatModel: () => ChatModel = defaultChatModel;

/** Tests install a mock model here (`undefined` restores Vertex). */
export const setChatModelForTests = (
  factory: (() => ChatModel) | undefined
): void => {
  chatModel = factory ?? defaultChatModel;
};

export interface BuiltAgent {
  agent: ToolLoopAgent<never, ToolSet>;
  /** The merged, normalised, soft-abort-wrapped tool set the agent runs with. */
  allTools: ToolSet;
  instructions: string;
}

/**
 * The one `ToolLoopAgent` of a turn (shared by the default and the custom-view orchestrator).
 *
 * `toolChoice: 'auto'`, `temperature: 0.3`, at most `CHAT_MAX_STEPS` (50) steps, and the time
 * budget: tools are aborted at the soft deadline, the step after it is a text-only wrap-up,
 * and the loop ends when less than 5 s remain.
 */
export const createChatAgent = (params: {
  ctx: ToolContext;
  instructions: string;
  tools: ToolSet;
}): BuiltAgent => {
  const { ctx, instructions, tools } = params;
  const { model, providerOptions } = chatModel();
  const allTools = withSoftAbort(tools, ctx.budget);

  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools: allTools,
    toolChoice: 'auto',
    temperature: 0.3,
    providerOptions,
    stopWhen: [stepCountIs(CHAT_MAX_STEPS), budgetExhausted(ctx.budget)],
    prepareStep: wrapUpPrepareStep(ctx.budget, instructions),
  }) as unknown as ToolLoopAgent<never, ToolSet>;

  return { agent, allTools, instructions };
};

/**
 * The default orchestrator (capability agent-orchestration).
 *
 * It is FLAT: it merges the tools of every contributing source and calls them directly, no
 * delegation to sub-agents. Instructions, in order: the preamble generated from the
 * contributing sources, the project system prompt wrapped ONCE in `<developer_instructions>`
 * (omitted when blank), then each contributing source's fragment.
 */
export const buildOrchestrator = async (
  ctx: ToolContext,
  registry: ToolSourceRegistry
): Promise<BuiltAgent> => {
  const { tools, fragments, contributing } = await registry.resolve(ctx);
  const instructions = [
    buildPreamble(contributing),
    getProjectSystemPromptSection(ctx.projectSystemPrompt),
    ...fragments,
  ].join('\n');
  return createChatAgent({ ctx, instructions, tools });
};
