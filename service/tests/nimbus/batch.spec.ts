/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, jest, test } from '@jest/globals';
import type { Tool, ToolSet } from 'ai';
import {
  GET_COMPONENTS_TOOL,
  withBatchedComponentLookup,
} from '../../src/nimbus/batch';
import { callTool } from './helpers';

/**
 * `get_components` replaces Nimbus MCP's `get_component`. What is worth pinning is not the
 * fan-out but what makes replacing a served tool safe: the original is delegated to, one bad
 * name does not lose the others, duplicates do not become calls, the input set is not
 * mutated, and a Nimbus release that drops `get_component` degrades.
 */

type Input = { name: string; section?: string };
type Impl = (input: Input) => unknown;

const fakeGetComponent = (impl?: Impl) => {
  const execute = jest.fn(async (input: Input, _options?: unknown) =>
    impl
      ? impl(input)
      : { content: [{ type: 'text', text: `docs for ${input.name}` }] }
  );
  return { execute, tool: { execute } as unknown as Tool };
};

const served = (single: Tool): ToolSet => ({
  get_component: single,
  list_components: { execute: async () => 'x' } as unknown as Tool,
  get_tokens: { execute: async () => 'y' } as unknown as Tool,
});

type Component = { name: string; section?: string; component?: unknown; error?: string };
type BatchResult = { components: Component[]; error?: string; hint?: string };

const run = async (
  input: Record<string, unknown>,
  single = fakeGetComponent()
) => {
  const tools = withBatchedComponentLookup(served(single.tool));
  const result = (await callTool(tools, GET_COMPONENTS_TOOL, input)) as BatchResult;
  return { result, single };
};

describe('withBatchedComponentLookup', () => {
  test('replaces get_component and leaves the other tools alone', () => {
    const tools = withBatchedComponentLookup(served(fakeGetComponent().tool));
    expect(tools[GET_COMPONENTS_TOOL]).toBeDefined();
    expect(tools.get_component).toBeUndefined();
    expect(tools.list_components).toBeDefined();
    expect(tools.get_tokens).toBeDefined();
  });

  test('does not mutate the tool set it was given', () => {
    const original = served(fakeGetComponent().tool);
    withBatchedComponentLookup(original);
    expect(original.get_component).toBeDefined();
    expect(original[GET_COMPONENTS_TOOL]).toBeUndefined();
  });

  test('degrades to the served set when get_component is absent', () => {
    const without: ToolSet = {
      list_components: { execute: async () => 'x' } as unknown as Tool,
    };
    expect(withBatchedComponentLookup(without)).toBe(without);
  });
});

describe('get_components', () => {
  test('one call covers every name, delegating to the original tool', async () => {
    const { result, single } = await run({ names: ['Button', 'Card', 'Text'] });
    expect(single.execute).toHaveBeenCalledTimes(3);
    expect(result.components.map((c) => c.name)).toEqual([
      'Button',
      'Card',
      'Text',
    ]);
    expect(result.components[0].component).toEqual({
      content: [{ type: 'text', text: 'docs for Button' }],
    });
  });

  test('names x sections is the cross product, in request order', async () => {
    const { result, single } = await run({
      names: ['Button', 'Card'],
      sections: ['props', 'implementation'],
    });
    expect(single.execute).toHaveBeenCalledTimes(4);
    expect(result.components.map((c) => `${c.name}:${c.section}`)).toEqual([
      'Button:props',
      'Button:implementation',
      'Card:props',
      'Card:implementation',
    ]);
  });

  test('omitting sections asks for metadata, with no section key sent', async () => {
    const { result, single } = await run({ names: ['Button'] });
    expect(single.execute.mock.calls[0][0]).toEqual({ name: 'Button' });
    expect(result.components[0].section).toBeUndefined();
  });

  test('the caller options (abort signal, ids) reach every delegated call', async () => {
    const single = fakeGetComponent();
    const tools = withBatchedComponentLookup(served(single.tool));
    const controller = new AbortController();
    await callTool(
      tools,
      GET_COMPONENTS_TOOL,
      { names: ['A', 'B'] },
      { toolCallId: 'call-9', abortSignal: controller.signal }
    );
    for (const [, options] of single.execute.mock.calls) {
      expect(options).toMatchObject({
        toolCallId: 'call-9',
        abortSignal: controller.signal,
      });
    }
  });

  test('duplicate names are not duplicate calls', async () => {
    const { result, single } = await run({
      names: ['Card', 'Card', ' Card ', 'Text'],
    });
    expect(single.execute).toHaveBeenCalledTimes(2);
    expect(result.components.map((c) => c.name)).toEqual(['Card', 'Text']);
  });

  test('one bad name does not lose the others', async () => {
    const single = fakeGetComponent((input) => {
      if (input.name === 'Nonexistent') throw new Error('unknown component');
      return { content: [{ type: 'text', text: `docs for ${input.name}` }] };
    });
    const { result } = await run(
      { names: ['Button', 'Nonexistent', 'Card'] },
      single
    );
    expect(result.components).toHaveLength(3);
    expect(result.components[1].error).toContain('unknown component');
    expect(result.components[0].component).toBeDefined();
    expect(result.components[2].component).toBeDefined();
  });

  test('refuses an oversized request instead of truncating it', async () => {
    const { result, single } = await run({
      names: Array.from({ length: 30 }, (_, i) => `Component${i}`),
      sections: ['props'],
    });
    expect(result.error).toMatch(/Too many lookups/);
    expect(result.hint).toMatch(/groups of at most/);
    expect(single.execute).not.toHaveBeenCalled();
  });

  test('bounds how many calls are in flight at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const execute = jest.fn(async (input: Input, _options?: unknown) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { name: input.name };
    });
    await run(
      { names: Array.from({ length: 20 }, (_, i) => `C${i}`) },
      { execute, tool: { execute } as unknown as Tool }
    );
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });
});
