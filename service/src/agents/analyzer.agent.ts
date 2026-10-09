/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod';
import { ANALYZER_HISTORY_MESSAGES } from '../chat/constants';
import { getModel, getProviderOptions } from '../llm';
import { endWithUserMessage, sanitizeMessages } from '../utils/message.utils';
import { estimateTokens, sizeOf } from '../utils/token-estimate.utils';

const QueryAnalysisSchema = z.object({
  hasAggregation: z
    .boolean()
    .describe(
      'True if query requires data aggregation or calculations or result size is too large'
    ),
});

export type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>;

const systemPrompt = (
  resultSizeTokens?: number,
  toolName?: string,
  args?: unknown
) => `You are a query analyzer that analyzes the query and determines if it needs to be stored or not. This decision will prevent from passing huge amounts of data to the next agent.

Your task:
1. Determine if a query requires aggregation considering message history, and if so, return true for hasAggregation.
2. Determine if the result size provided is too large, and if so, return true for hasAggregation.
3. Guess that if the tool call with the name ${toolName} and arguments ${args} will return a large result, and if so, return true for hasAggregation.

Notes: Most tools from commercetools will return total count of records, so if the query is asking for a count, it does not require aggregation.

How to Analyze:
1. Examine messages thoroughly to determine if the recent requirements are asking for aggregation.
2. If the result is going to be used for listing or getting IDs of records, it DOESN'T require aggregation.

IMPORTANT: Look at the last message in the messages array to determine if the data has been fetched or not during last tool calls.
IMPORTANT: System might call the tools multiple times, so you need to consider the data fetched from the previous tool calls. and return true to continue with aggregation.
IMPORTANT: if the ${toolName} suggests that it's a creation or update operation, return false for hasAggregation.


Examples:

Input: "Get information on product with ID 123"
Output: {
hasAggregation: false,
}

Input: "What is the most purchased product last year?"
Output: {
hasAggregation: true,
}

Input: "Show me all orders from last month"
Output: {
hasAggregation: true,
}

Input: "Order details for order with ID 345"
Output: {
hasAggregation: false,
}

Input: "How many orders were placed last month?"
Output: {
hasAggregation: true,
}

Input: "Which customer spent the most money in Q3?"
Output: {
hasAggregation: true,
}

Input: "Compare sales performance between March and April"
Output: {
hasAggregation: true,
}

Input: "Export orders from last month to a CSV file"
Output: {
hasAggregation: true,
}


`;

/**
 * Estimated-token size at which a tool result is offloaded without asking the model.
 *
 * The size comes from `estimateTokens` (chars / 4, measured 0.93-1.00 accurate against the
 * provider's own count), not from a `countTokens` round trip per tool call. The threshold is
 * a crude safety valve: the largest tool result seen in production is ~64k chars, roughly 6x
 * below it, so estimation error cannot flip it.
 */
export const OFFLOAD_WITHOUT_ASKING_TOKENS = Math.pow(10, 5);

export interface AnalyzeQueryParams {
  messages: ModelMessage[];
  /**
   * `resultChars` is the serialized length of `result`, which the caller (change L's
   * tool-result pipeline) has already computed; passing it avoids a second `JSON.stringify`.
   */
  toolCallParams: {
    args: unknown;
    toolName: string;
    result: unknown;
    resultChars?: number;
  };
}

export interface AnalyzeQueryDeps {
  /** Seam for tests: the structured model call. */
  generate?: (input: {
    system: string;
    messages: ModelMessage[];
  }) => Promise<QueryAnalysis>;
}

const generateWithLiteModel: NonNullable<AnalyzeQueryDeps['generate']> = async ({
  system,
  messages,
}) => {
  // The CHEAP model, deliberately: one boolean per tool call does not need the orchestrator's
  // thinking configuration (measured 2.9-4.3 s there). The safety net for a worse judgement
  // is the size gate, which offloads anything over `OFFLOAD_WITHOUT_ASKING_TOKENS` without
  // consulting a model.
  const result = await generateText({
    model: getModel('lite'),
    output: Output.object({ schema: QueryAnalysisSchema }),
    system,
    messages,
    providerOptions: getProviderOptions('lite'),
  });
  return result.output;
};

/**
 * Decides whether a tool result has to be offloaded (aggregated) instead of being handed to
 * the next step. Used by the tool-result pipeline of change L.
 *
 * 1. no usable history -> `false`, no model call;
 * 2. result larger than `OFFLOAD_WITHOUT_ASKING_TOKENS` -> `true`, no model call;
 * 3. otherwise the verdict of a structured call to the lite model.
 *
 * Two behaviours are kept as they were on purpose (they change what the model sees on every
 * tool call and want their own measurement): the prompt never interpolates the result size,
 * and `args` is coerced with `${args}`, so an object renders as `[object Object]`.
 */
export const analyzeQueryTask = async (
  { messages, toolCallParams }: AnalyzeQueryParams,
  deps: AnalyzeQueryDeps = {}
): Promise<{ output: QueryAnalysis }> => {
  // Only text of user/assistant turns: tool messages cannot be reduced to a string, and an
  // assistant turn that is purely a tool call sanitizes to a placeholder that tells the
  // analyzer nothing. `endWithUserMessage` enforces the invariant Gemini needs (a request
  // never ends with a model turn).
  const recentMessages = endWithUserMessage(
    sanitizeMessages(messages, {
      maxMessages: ANALYZER_HISTORY_MESSAGES,
      excludeToolMessages: true,
      filterEmpty: true,
    })
  );

  const resultSizeTokens = estimateTokens(
    toolCallParams.resultChars ?? sizeOf(toolCallParams.result)
  );

  if (recentMessages.length === 0) {
    return { output: { hasAggregation: false } };
  }

  if (resultSizeTokens > OFFLOAD_WITHOUT_ASKING_TOKENS) {
    return { output: { hasAggregation: true } };
  }

  const generate = deps.generate ?? generateWithLiteModel;
  const output = await generate({
    system: systemPrompt(
      resultSizeTokens,
      toolCallParams.toolName,
      toolCallParams.args
    ),
    messages: recentMessages as ModelMessage[],
  });
  return { output };
};
