/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { LanguageModelUsage, UIMessage } from 'ai';

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type PartWithOutput = {
  output?: { metadata?: { usage?: UsageLike }; parts?: unknown[] };
};

/** Message with optional metadata.usage (UI message / stored message format). */
type MessageWithUsage = {
  metadata?: { usage?: UsageLike };
  parts?: PartWithOutput[];
};

/** Accumulated usage tracker for the model loop. */
export interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const zero = (): AccumulatedUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

const extractUsage = (usage: UsageLike | undefined): AccumulatedUsage =>
  usage
    ? {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      }
    : zero();

const addUsages = (
  a: AccumulatedUsage,
  b: AccumulatedUsage
): AccumulatedUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
});

/** Recursively extract usage from tool output parts (e.g. tool-imageGeneration.output). */
const getUsageFromParts = (parts: unknown[]): AccumulatedUsage => {
  let acc = zero();
  for (const part of parts) {
    const output = (part as PartWithOutput | null)?.output;
    if (!output) continue;
    if (output.metadata?.usage) {
      acc = addUsages(acc, extractUsage(output.metadata.usage));
      continue;
    }
    if (Array.isArray(output.parts)) {
      acc = addUsages(acc, getUsageFromParts(output.parts));
    }
  }
  return acc;
};

/** Only the three token counters survive into storage; zero counters are omitted. */
export const getMetadataFromMessage = (
  message?: Pick<UIMessage, 'metadata'>
): { metadata?: { usage: UsageLike } } => {
  const usage = (message?.metadata as { usage?: UsageLike } | undefined)?.usage;
  if (usage?.inputTokens || usage?.outputTokens || usage?.totalTokens) {
    return {
      metadata: {
        usage: {
          ...(usage.inputTokens && { inputTokens: usage.inputTokens }),
          ...(usage.outputTokens && { outputTokens: usage.outputTokens }),
          ...(usage.totalTokens && { totalTokens: usage.totalTokens }),
        },
      },
    };
  }
  return {};
};

/**
 * Sum the usage of a conversation: each message's own `metadata.usage` plus the usage
 * reported inside nested tool outputs (a subagent tool carries `output.metadata.usage` or
 * nested `output.parts`). Has no side effects and never logs.
 */
export const getAccumulatedUsage = (
  messages?: ReadonlyArray<MessageWithUsage | UIMessage>
): AccumulatedUsage => {
  if (!messages?.length) return zero();
  return messages.reduce((acc, message) => {
    const m = message as MessageWithUsage;
    let next = addUsages(acc, extractUsage(m.metadata?.usage));
    if (Array.isArray(m.parts))
      next = addUsages(next, getUsageFromParts(m.parts));
    return next;
  }, zero());
};

/** Add usage from one model step to an accumulator. */
export const addUsage = (
  accumulated: AccumulatedUsage,
  usage?: LanguageModelUsage
): AccumulatedUsage => ({
  inputTokens: accumulated.inputTokens + (usage?.inputTokens || 0),
  outputTokens: accumulated.outputTokens + (usage?.outputTokens || 0),
  totalTokens: accumulated.totalTokens + (usage?.totalTokens || 0),
});
