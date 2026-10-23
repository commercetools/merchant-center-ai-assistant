/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

export type Chunk = LanguageModelV4StreamPart;

export const usage = (input = 3, output = 5) => ({
  inputTokens: {
    total: input,
    noCache: input,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

export const finish = (
  unified: 'stop' | 'tool-calls' | 'error' = 'stop'
): Chunk => ({
  type: 'finish',
  finishReason: { unified, raw: undefined },
  usage: usage(),
});

/** A model turn that answers `text`. */
export const textTurn = (text: string, id = 't1'): Chunk[] => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id },
  { type: 'text-delta', id, delta: text },
  { type: 'text-end', id },
  finish('stop'),
];

/** A model turn that calls one tool with JSON input. */
export const toolCallTurn = (
  toolName: string,
  input: unknown,
  toolCallId = 'call-1'
): Chunk[] => [
  { type: 'stream-start', warnings: [] },
  {
    type: 'tool-call',
    toolCallId,
    toolName,
    input: JSON.stringify(input),
  },
  finish('tool-calls'),
];

export type StreamCall = {
  prompt: unknown;
  abortSignal?: AbortSignal;
  toolChoice?: unknown;
  tools?: unknown;
};

/**
 * A scripted model: the n-th call to `doStream` plays `turns[n]` (the last turn repeats).
 * `calls` records what the model was asked, so tests can assert on prompts, tools and signals.
 */
export const scriptedModel = (
  turns: Array<Chunk[] | (() => Chunk[] | ReadableStream<Chunk>)>
) => {
  const calls: StreamCall[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push({
        prompt: options.prompt,
        abortSignal: options.abortSignal,
        toolChoice: options.toolChoice,
        tools: options.tools,
      });
      const turn = turns[Math.min(calls.length - 1, turns.length - 1)];
      const resolved = typeof turn === 'function' ? turn() : turn;
      return {
        stream:
          resolved instanceof ReadableStream
            ? resolved
            : simulateReadableStream({ chunks: resolved }),
      };
    },
  });
  return { model, calls };
};

/** A model whose stream never emits anything (a hung provider). */
export const hangingModel = () =>
  scriptedModel([() => new ReadableStream<Chunk>({ start: () => undefined })]);
