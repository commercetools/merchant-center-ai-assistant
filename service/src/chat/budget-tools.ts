/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { StopCondition, ToolSet } from 'ai';
import type { RequestBudget } from './request-budget';

/** Appended to the instructions of the wrap-up step. */
export const WRAP_UP_NOTICE =
  '\n\nTIME IS NEARLY UP. Do not call any more tools. Write the final answer now: summarise what you found, say clearly what could not be completed, and suggest the next step.';

/** What a tool returns when the soft deadline stopped it. */
export const STOPPED_BY_TIME_LIMIT = {
  error: 'Stopped: time limit reached',
} as const;

/** Below this the loop ends instead of starting another step. */
export const MIN_STEP_BUDGET_MS = 5_000;

type ExecuteOptions = { abortSignal?: AbortSignal } & Record<string, unknown>;
type ExecuteFn = (input: unknown, options: ExecuteOptions) => unknown;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { [Symbol.asyncIterator]?: unknown })[
    Symbol.asyncIterator
  ] === 'function';

/** Resolves with `STOPPED` as soon as the signal aborts (or already is aborted). */
const whenAborted = (
  signal: AbortSignal
): Promise<typeof STOPPED_BY_TIME_LIMIT> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(STOPPED_BY_TIME_LIMIT);
      return;
    }
    signal.addEventListener('abort', () => resolve(STOPPED_BY_TIME_LIMIT), {
      once: true,
    });
  });

const isAbortLike = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'AbortError' || error.name === 'TimeoutError');

type StoppedPredicate = (error: unknown) => boolean;

async function* softAbortIterable(
  result: AsyncIterable<unknown>,
  soft: Promise<typeof STOPPED_BY_TIME_LIMIT>,
  stoppedBySoftDeadline: StoppedPredicate
): AsyncGenerator<unknown> {
  const iterator = result[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), soft]);
      if ('done' in next) {
        if (next.done) return;
        yield next.value;
        continue;
      }
      iterator.return?.();
      yield STOPPED_BY_TIME_LIMIT;
      return;
    }
  } catch (error) {
    if (stoppedBySoftDeadline(error)) {
      yield STOPPED_BY_TIME_LIMIT;
      return;
    }
    throw error;
  }
}

const softAbortPromise = async (
  result: unknown,
  soft: Promise<typeof STOPPED_BY_TIME_LIMIT>,
  stoppedBySoftDeadline: StoppedPredicate
): Promise<unknown> => {
  try {
    return await Promise.race([Promise.resolve(result), soft]);
  } catch (error) {
    if (stoppedBySoftDeadline(error)) return STOPPED_BY_TIME_LIMIT;
    throw error;
  }
};

/**
 * Wraps every executable tool so that:
 *  - its `execute` receives `AbortSignal.any([sdkSignal, budget.softSignal])`;
 *  - when the SOFT deadline stops it (it observes the abort, or ignores the signal and is still
 *    running), the tool answers `{ error: 'Stopped: time limit reached' }` instead of raising
 *    through the stream, so the loop continues to the wrap-up step;
 *  - a tool's own errors still propagate unchanged. A hard abort (time limit or client
 *    disconnect) is not converted: the run is being torn down anyway.
 *
 * Generator tools (subagents) are wrapped by re-yielding their chunks.
 */
export const withSoftAbort = <T extends ToolSet>(
  tools: T,
  budget: RequestBudget
): T => {
  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const original = (tool as { execute?: ExecuteFn }).execute;
    if (typeof original !== 'function') {
      wrapped[name] = tool;
      continue;
    }

    const execute: ExecuteFn = (input, options) => {
      const signals = [budget.softSignal];
      if (options?.abortSignal) signals.push(options.abortSignal);
      const signal = AbortSignal.any(signals);
      const soft = whenAborted(budget.softSignal);

      const stoppedBySoftDeadline = (error: unknown): boolean =>
        budget.softSignal.aborted &&
        !(options?.abortSignal?.aborted ?? false) &&
        isAbortLike(error);

      const result = original(input, { ...options, abortSignal: signal });

      return isAsyncIterable(result)
        ? softAbortIterable(result, soft, stoppedBySoftDeadline)
        : softAbortPromise(result, soft, stoppedBySoftDeadline);
    };

    wrapped[name] = { ...tool, execute } as unknown as ToolSet[string];
  }
  return wrapped as T;
};

/**
 * `prepareStep` for the orchestrator: unchanged while time remains; once the soft deadline
 * has passed the next step is a text-only wrap-up (`toolChoice: 'none'` + notice).
 */
export const wrapUpPrepareStep =
  (budget: RequestBudget, baseInstructions: string) =>
  (): { toolChoice: 'none'; instructions: string } | undefined =>
    budget.phase() === 'normal'
      ? undefined
      : { toolChoice: 'none', instructions: baseInstructions + WRAP_UP_NOTICE };

/** Ends the loop when there is no time left for another step. */
export const budgetExhausted =
  (budget: RequestBudget): StopCondition<ToolSet> =>
  () =>
    budget.remainingMs() < MIN_STEP_BUDGET_MS;
