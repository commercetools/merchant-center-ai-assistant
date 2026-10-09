/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { ToolLoopAgent, type UIMessage } from 'ai';
import {
  createSubagentTool,
  type AgentDefinition,
} from '../../src/agents/subagent-tool';
import { makeToolContext } from '../helpers/stub-tool-source';
import { hangingModel, scriptedModel, textTurn } from '../helpers/mock-model';

const contexts: Array<{ dispose: () => void }> = [];
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
});

type Executable = {
  execute: (
    input: { task: string },
    options: {
      toolCallId: string;
      messages: unknown[];
      abortSignal?: AbortSignal;
    }
  ) => AsyncIterable<UIMessage>;
  toModelOutput: (args: {
    toolCallId: string;
    input: unknown;
    output: unknown;
  }) => { type: string; value: string };
};

const definition = (
  runnerModel: ReturnType<typeof scriptedModel>['model'],
  extra: Partial<AgentDefinition> = {}
): AgentDefinition => ({
  meta: { key: 'imageGeneration', name: 'Image', description: 'makes images' },
  createAgent: async () =>
    new ToolLoopAgent({ model: runnerModel, instructions: 'child' }),
  ...extra,
});

const drain = async (iterable: AsyncIterable<UIMessage>) => {
  const seen: UIMessage[] = [];
  for await (const message of iterable) seen.push(message);
  return seen;
};

describe('createSubagentTool', () => {
  it('streams the child progress and compresses the result to the last text part', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    const { model } = scriptedModel([textTurn('child answer')]);
    const t = createSubagentTool(
      definition(model),
      ctx
    ) as unknown as Executable;

    const messages = await drain(
      t.execute({ task: 'do it' }, { toolCallId: 'c1', messages: [] })
    );
    expect(messages.length).toBeGreaterThan(0);
    const last = messages[messages.length - 1];
    expect(JSON.stringify(last.parts)).toContain('child answer');
    expect(
      t.toModelOutput({ toolCallId: 'c1', input: {}, output: last })
    ).toEqual({
      type: 'text',
      value: 'child answer',
    });
  });

  it('answers "Task completed." when the child produced no text', () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    const { model } = scriptedModel([textTurn('x')]);
    const t = createSubagentTool(
      definition(model),
      ctx
    ) as unknown as Executable;
    expect(
      t.toModelOutput({
        toolCallId: 'c1',
        input: {},
        output: { id: 'm', role: 'assistant', parts: [{ type: 'file' }] },
      }).value
    ).toBe('Task completed.');
  });

  it('passes the task as the last user message after the inherited ones', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    const { model, calls } = scriptedModel([textTurn('ok')]);
    const t = createSubagentTool(
      definition(model),
      ctx
    ) as unknown as Executable;
    await drain(
      t.execute(
        { task: 'draw a cat' },
        {
          toolCallId: 'c1',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          ],
        }
      )
    );
    const prompt = JSON.stringify(calls[0].prompt);
    expect(prompt.indexOf('hello')).toBeGreaterThan(-1);
    expect(prompt.indexOf('draw a cat')).toBeGreaterThan(
      prompt.indexOf('hello')
    );
  });

  it('gives the child the parent abort signal', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    const parent = new AbortController();
    const { model, calls } = hangingModel();
    const t = createSubagentTool(
      definition(model),
      ctx
    ) as unknown as Executable;
    const run = drain(
      t.execute(
        { task: 'x' },
        { toolCallId: 'c1', messages: [], abortSignal: parent.signal }
      )
    ).catch(() => undefined);
    for (let i = 0; i < 50 && calls.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(calls).toHaveLength(1);
    expect(calls[0].abortSignal?.aborted).toBe(false);
    parent.abort();
    expect(calls[0].abortSignal?.aborted).toBe(true);
    await run;
  });

  it('applies prepareTaskMessages and processMessage', async () => {
    const ctx = makeToolContext();
    contexts.push(ctx);
    const { model, calls } = scriptedModel([textTurn('ok')]);
    const t = createSubagentTool(
      definition(model, {
        prepareTaskMessages: async () => [],
        processMessage: async (message) => ({ ...message, id: 'processed' }),
      }),
      ctx
    ) as unknown as Executable;
    const seen = await drain(
      t.execute(
        { task: 'x' },
        {
          toolCallId: 'c1',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'INHERITED' }] },
          ],
        }
      )
    );
    expect(seen.every((m) => m.id === 'processed')).toBe(true);
    expect(JSON.stringify(calls[0].prompt)).not.toContain('INHERITED');
  });
});
