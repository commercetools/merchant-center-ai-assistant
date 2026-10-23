/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import type { ToolSet } from 'ai';
import {
  budgetExhausted,
  STOPPED_BY_TIME_LIMIT,
  withSoftAbort,
  WRAP_UP_NOTICE,
  wrapUpPrepareStep,
} from '../../src/chat/budget-tools';
import { RequestBudget } from '../../src/chat/request-budget';

type Exec = (input: unknown, options: { abortSignal?: AbortSignal }) => unknown;

const disposables: RequestBudget[] = [];
afterEach(() => {
  while (disposables.length) disposables.pop()?.dispose();
});

/** A budget of 400 ms with a 100 ms reserve: the soft deadline fires after 300 ms. */
const smallBudget = (clientGone = new AbortController()) => {
  const budget = new RequestBudget(Date.now(), 400, 100, clientGone.signal);
  disposables.push(budget);
  return { budget, clientGone };
};

const toolOf = (execute: Exec): ToolSet =>
  ({ t: { description: 'd', inputSchema: {}, execute } }) as unknown as ToolSet;

const run = async (
  tools: ToolSet,
  options: { abortSignal?: AbortSignal } = {}
) => {
  const execute = (tools.t as unknown as { execute: Exec }).execute;
  return execute({}, options);
};

describe('withSoftAbort', () => {
  it('gives the tool a signal that aborts at the soft deadline and answers the stop marker', async () => {
    const { budget } = smallBudget();
    let observed: AbortSignal | undefined;
    const tools = withSoftAbort(
      toolOf(
        (_input, options) =>
          new Promise((_resolve, reject) => {
            observed = options.abortSignal;
            options.abortSignal?.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              )
            );
          })
      ),
      budget
    );
    const startedAt = Date.now();
    const result = await run(tools);
    expect(result).toEqual(STOPPED_BY_TIME_LIMIT);
    expect(observed?.aborted).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(380);
  });

  it('stops a tool that ignores its signal at the soft deadline', async () => {
    const { budget } = smallBudget();
    const tools = withSoftAbort(
      toolOf(() => new Promise(() => undefined)),
      budget
    );
    expect(await run(tools)).toEqual(STOPPED_BY_TIME_LIMIT);
  });

  it('propagates the tool own errors', async () => {
    const { budget } = smallBudget();
    const tools = withSoftAbort(
      toolOf(async () => {
        throw new Error('boom');
      }),
      budget
    );
    await expect(run(tools)).rejects.toThrow('boom');
  });

  it('passes a fast result through untouched', async () => {
    const { budget } = smallBudget();
    const tools = withSoftAbort(
      toolOf(async () => ({ ok: true })),
      budget
    );
    expect(await run(tools)).toEqual({ ok: true });
  });

  it('keeps generator tools streaming', async () => {
    const { budget } = smallBudget();
    const tools = withSoftAbort(
      toolOf(async function* () {
        yield 'a';
        yield 'b';
      }),
      budget
    );
    const seen: unknown[] = [];
    for await (const chunk of (await run(tools)) as AsyncIterable<unknown>)
      seen.push(chunk);
    expect(seen).toEqual(['a', 'b']);
  });

  it('stops a generator tool that is still running at the soft deadline', async () => {
    const { budget } = smallBudget();
    const tools = withSoftAbort(
      toolOf(async function* () {
        yield 'first';
        await new Promise(() => undefined);
      }),
      budget
    );
    const seen: unknown[] = [];
    for await (const chunk of (await run(tools)) as AsyncIterable<unknown>)
      seen.push(chunk);
    expect(seen).toEqual(['first', STOPPED_BY_TIME_LIMIT]);
  });

  it('does not convert a client disconnect into the stop marker', async () => {
    const { budget, clientGone } = smallBudget();
    const tools = withSoftAbort(
      toolOf(
        (_input, options) =>
          new Promise((_resolve, reject) => {
            options.abortSignal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('gone'), { name: 'AbortError' }))
            );
          })
      ),
      budget
    );
    const pending = run(tools, { abortSignal: clientGone.signal });
    clientGone.abort();
    await expect(pending).rejects.toThrow('gone');
  });

  it('leaves tools without execute alone', () => {
    const { budget } = smallBudget();
    const input = { t: { description: 'no execute' } } as unknown as ToolSet;
    expect(withSoftAbort(input, budget).t).toBe(input.t);
  });
});

describe('wrapUpPrepareStep and budgetExhausted', () => {
  it('returns undefined while time remains', () => {
    const { budget } = smallBudget();
    expect(wrapUpPrepareStep(budget, 'base')()).toBeUndefined();
  });

  it('forces a text-only step with the notice after the soft deadline', async () => {
    const { budget } = smallBudget();
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(wrapUpPrepareStep(budget, 'base')()).toEqual({
      toolChoice: 'none',
      instructions: 'base' + WRAP_UP_NOTICE,
    });
  });

  it('stops the loop when less than 5 s remain', () => {
    const { budget } = smallBudget();
    expect(budgetExhausted(budget)({ steps: [] })).toBe(true);
    const long = new RequestBudget(
      Date.now(),
      60_000,
      10_000,
      new AbortController().signal
    );
    disposables.push(long);
    expect(budgetExhausted(long)({ steps: [] })).toBe(false);
  });
});
