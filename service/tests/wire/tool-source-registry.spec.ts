/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { jsonSchema, tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { makeToolContext, StubToolSource } from '../helpers/stub-tool-source';

const echo = tool({
  description: 'echo',
  inputSchema: z.object({ text: z.string() }),
  execute: async ({ text }) => text,
});
const ping = tool({
  description: 'ping',
  inputSchema: z.object({}),
  execute: async () => 'pong',
});

const contexts: Array<{ dispose: () => void }> = [];
const ctxFor = (...args: Parameters<typeof makeToolContext>) => {
  const ctx = makeToolContext(...args);
  contexts.push(ctx);
  return ctx;
};
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
});

describe('registration', () => {
  it('rejects duplicate names naming the duplicate', () => {
    const registry = createToolSourceRegistry();
    registry.register(new StubToolSource({ name: 'stub' }));
    expect(() =>
      registry.register(new StubToolSource({ name: 'stub' }))
    ).toThrow(/Duplicate ToolSource name: stub/);
  });

  it('resolves a stub source alone', async () => {
    const registry = createToolSourceRegistry();
    registry.register(new StubToolSource({ name: 'stub', tools: { echo } }));
    const { tools, contributing } = await registry.resolve(ctxFor());
    expect(Object.keys(tools)).toEqual(['echo']);
    expect(contributing.map((s) => s.name)).toEqual(['stub']);
  });
});

describe('isolation and timeout', () => {
  it('skips a hanging source after the timeout and warns, others still resolve', async () => {
    const registry = createToolSourceRegistry(50);
    registry.register(
      new StubToolSource({ name: 'a', hangs: true, order: 10 }),
      new StubToolSource({ name: 'b', tools: { echo }, order: 20 })
    );
    const ctx = ctxFor();
    const startedAt = Date.now();
    const { tools } = await registry.resolve(ctx);
    expect(Object.keys(tools)).toEqual(['echo']);
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(ctx.log.warnings.some((w) => w.includes('a skipped'))).toBe(true);
  });

  it('a hanging isEnabled is bounded by the same timeout', async () => {
    const registry = createToolSourceRegistry(50);
    const hanging: StubToolSource = new StubToolSource({
      name: 'h',
      tools: { echo },
    });
    hanging.isEnabled = () => new Promise(() => undefined);
    registry.register(hanging);
    const { tools } = await registry.resolve(ctxFor());
    expect(tools).toEqual({});
  });

  it('a throwing source contributes nothing and the turn proceeds', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'a', throws: true, order: 1 }),
      new StubToolSource({ name: 'b', tools: { ping }, order: 2 })
    );
    const ctx = ctxFor();
    const { tools } = await registry.resolve(ctx);
    expect(Object.keys(tools)).toEqual(['ping']);
    expect(ctx.log.warnings.some((w) => w.includes('a skipped'))).toBe(true);
  });
});

describe('deterministic merge', () => {
  it('merges by order whatever the completion order', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({
        name: 'fast',
        order: 20,
        tools: { ping },
        prompt: 'FAST',
        displayName: 'Fast',
      }),
      new StubToolSource({
        name: 'slow',
        order: 10,
        tools: { echo },
        prompt: 'SLOW',
        displayName: 'Slow',
        delayMs: 40,
      })
    );
    const { tools, fragments, contributing } = await registry.resolve(ctxFor());
    expect(Object.keys(tools)).toEqual(['echo', 'ping']);
    expect(fragments).toEqual(['\n\n# Slow\n\nSLOW', '\n\n# Fast\n\nFAST']);
    expect(contributing.map((s) => s.name)).toEqual(['slow', 'fast']);
  });

  it('breaks order ties by name', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'zeta', order: 5, tools: { ping } }),
      new StubToolSource({ name: 'alpha', order: 5, tools: { echo } })
    );
    expect(registry.list().map((s) => s.name)).toEqual(['alpha', 'zeta']);
  });

  it('later source wins a tool-name collision and a warning is logged', async () => {
    const registry = createToolSourceRegistry();
    const first = tool({ description: 'first', inputSchema: z.object({}) });
    const second = tool({ description: 'second', inputSchema: z.object({}) });
    registry.register(
      new StubToolSource({ name: 'a', order: 1, tools: { dup: first } }),
      new StubToolSource({ name: 'b', order: 2, tools: { dup: second } })
    );
    const ctx = ctxFor();
    const { tools } = await registry.resolve(ctx);
    expect(tools.dup.description).toBe('second');
    expect(ctx.log.warnings.some((w) => w.includes('collision'))).toBe(true);
  });

  it('a disabled source adds no prompt fragment', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({
        name: 'off',
        enabled: false,
        tools: { echo },
        prompt: 'OFF',
      }),
      new StubToolSource({
        name: 'on',
        tools: { ping },
        prompt: 'ON',
        order: 200,
      })
    );
    const { fragments } = await registry.resolve(ctxFor());
    expect(fragments.join('')).not.toContain('OFF');
    expect(fragments.join('')).toContain('ON');
  });

  it('restricts to the named sources with `only`', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'a', tools: { echo } }),
      new StubToolSource({ name: 'b', tools: { ping } })
    );
    const { tools } = await registry.resolve(ctxFor(), { only: ['b'] });
    expect(Object.keys(tools)).toEqual(['ping']);
  });
});

describe('session tool switches', () => {
  it('removes a disabled tool and omits the prompt of an emptied source', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'stub', tools: { echo }, prompt: 'STUB' })
    );
    const { tools, fragments } = await registry.resolve(
      ctxFor({ session: { disabledTools: { stub: ['echo'] } } })
    );
    expect(tools).toEqual({});
    expect(fragments).toEqual([]);
  });

  it('keeps the other tools of the source and its prompt', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({
        name: 'stub',
        tools: { echo, ping },
        prompt: 'STUB',
      })
    );
    const { tools, fragments } = await registry.resolve(
      ctxFor({ session: { disabledTools: { stub: ['echo'] } } })
    );
    expect(Object.keys(tools)).toEqual(['ping']);
    expect(fragments).toHaveLength(1);
  });

  it('all_tools switches off the whole source', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'algolia', tools: { echo, ping } })
    );
    const { tools } = await registry.resolve(
      ctxFor({ session: { disabledTools: { algolia: ['all_tools'] } } })
    );
    expect(tools).toEqual({});
  });
});

describe('Gemini normalisation', () => {
  it('normalises the merged set once', async () => {
    const refHeavy = {
      description: 'ref heavy',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          query: { type: 'object', properties: { a: { type: 'string' } } },
          again: { $ref: '#/properties/query' },
          values: { type: 'array' },
        },
      }),
    } as unknown as ToolSet[string];
    const registry = createToolSourceRegistry();
    registry.register(new StubToolSource({ name: 'mcp', tools: { refHeavy } }));
    const { tools } = await registry.resolve(ctxFor());
    expect(tools.refHeavy).not.toBe(refHeavy);
  });
});

describe('menu and connected sources', () => {
  it('lists groups of configured sources only, independent of isEnabled', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'x', menu: null, order: 1 }),
      new StubToolSource({ name: 'ct', menu: { toolNames: [] }, order: 2 }),
      new StubToolSource({
        name: 'off',
        enabled: false,
        tools: { echo },
        order: 3,
      })
    );
    const groups = await registry.listMenuGroups(ctxFor());
    expect(groups).toEqual([
      { mcp: 'ct', toolNames: [] },
      { mcp: 'off', toolNames: ['echo'] },
    ]);
  });

  it('a throwing listForMenu is skipped', async () => {
    const registry = createToolSourceRegistry();
    const broken = new StubToolSource({ name: 'broken' });
    broken.listForMenu = async () => {
      throw new Error('menu failed');
    };
    registry.register(
      broken,
      new StubToolSource({ name: 'ok', tools: { echo } })
    );
    const groups = await registry.listMenuGroups(ctxFor());
    expect(groups.map((g) => g.mcp)).toEqual(['ok']);
  });

  it('connected names are the enabled integration sources', async () => {
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'core-one', kind: 'core', tools: { echo } }),
      new StubToolSource({ name: 'stripe', kind: 'integration' }),
      new StubToolSource({
        name: 'algolia',
        kind: 'integration',
        enabled: false,
      }),
      new StubToolSource({ name: 'unmarked' })
    );
    expect(await registry.listConnectedSourceNames(ctxFor())).toEqual([
      'stripe',
    ]);
  });
});
