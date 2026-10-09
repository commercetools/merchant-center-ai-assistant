/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  readUIMessageStream,
  tool,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import type { ToolContext } from '../tool-sources/types';
import type { AgentKey } from './agent-keys';

/** The part of a `ToolLoopAgent` a subagent tool needs (so tests can pass a fake). */
export interface SubagentRunner {
  stream(options: {
    messages: ModelMessage[];
    abortSignal?: AbortSignal;
  }): PromiseLike<{ toUIMessageStream(): ReadableStream<UIMessageChunk> }>;
}

/**
 * A subagent: an agent that runs inside one tool call. Only `imageGeneration` is one today;
 * every other former agent is a flat tool source.
 */
export interface AgentDefinition {
  meta: { key: AgentKey; name: string; description: string };
  createAgent(ctx: ToolContext): Promise<SubagentRunner>;
  /** Transform the messages the subagent receives (for example drop an oversized history). */
  prepareTaskMessages?(
    messages: ModelMessage[],
    task: string
  ): Promise<ModelMessage[]>;
  /** Transform a streamed message before it is yielded (for example upload a generated image). */
  processMessage?(message: UIMessage, ctx: ToolContext): Promise<UIMessage>;
  /** Override how the subagent result is shown to the parent model. */
  toModelOutput?: (args: { output: UIMessage | undefined }) => ToolResultOutput;
}

/**
 * Wraps an AgentDefinition into a streaming subagent tool.
 *
 * The tool creates the child agent when invoked, streams the child's progress to the UI via
 * `async function*`, passes the parent's `abortSignal` (so a stop, a client disconnect or the
 * time budget reaches the child), and compresses the whole child response into its last text
 * part for the parent's context via `toModelOutput`.
 */
export const createSubagentTool = (
  agentDef: AgentDefinition,
  ctx: ToolContext
) =>
  tool({
    description: agentDef.meta.description,
    inputSchema: z.object({
      task: z.string().describe('The task to complete'),
    }),
    execute: async function* ({ task }, { abortSignal, messages }) {
      const agent = await agentDef.createAgent(ctx);

      // The child inherits the parent's whole message list, so anything already large in the
      // orchestrator is duplicated here and then grown by this agent's own tool results.
      const inherited = agentDef.prepareTaskMessages
        ? await agentDef.prepareTaskMessages(messages ?? [], task)
        : (messages ?? []);

      const taskMessages: ModelMessage[] = [
        ...inherited,
        { role: 'user', content: task },
      ];

      const result = await agent.stream({
        messages: taskMessages,
        abortSignal,
      });

      for await (const message of readUIMessageStream({
        stream: result.toUIMessageStream(),
      })) {
        yield agentDef.processMessage
          ? await agentDef.processMessage(message, ctx)
          : message;
      }
    },
    toModelOutput: ({ output }) => {
      const typed = output as UIMessage | undefined;
      if (agentDef.toModelOutput) {
        return agentDef.toModelOutput({ output: typed });
      }
      const textParts = (typed?.parts ?? []).filter(
        (part): part is Extract<typeof part, { type: 'text' }> =>
          part.type === 'text'
      );
      return {
        type: 'text' as const,
        value: textParts[textParts.length - 1]?.text ?? 'Task completed.',
      };
    },
  });
