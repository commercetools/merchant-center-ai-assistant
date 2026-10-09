/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { tool } from 'ai';
import { z } from 'zod';
import {
  buildCustomViewOrchestrator,
  decodeCustomView,
} from '../../src/chat/custom-view-orchestrator';
import {
  buildOrchestrator,
  setChatModelForTests,
} from '../../src/chat/orchestrator';
import { registry as realRegistry } from '../../src/tool-sources';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { scriptedModel, textTurn } from '../helpers/mock-model';
import { captureLogs } from '../helpers/log-capture';
import { makeToolContext, StubToolSource } from '../helpers/stub-tool-source';

const contexts: Array<{ dispose: () => void }> = [];
afterEach(() => {
  setChatModelForTests(undefined);
  while (contexts.length) contexts.pop()?.dispose();
});

const ctxOf = (...args: Parameters<typeof makeToolContext>) => {
  const ctx = makeToolContext(...args);
  contexts.push(ctx);
  return ctx;
};

const echo = tool({
  description: 'echo',
  inputSchema: z.object({ text: z.string() }),
  execute: async ({ text }) => text,
});

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const useMock = () => {
  const mock = scriptedModel([textTurn('ok')]);
  setChatModelForTests(() => ({ model: mock.model }));
  return mock;
};

describe('buildOrchestrator', () => {
  it('injects the project prompt exactly once, after the preamble and before the fragments', async () => {
    useMock();
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({
        name: 'a',
        displayName: 'Alpha',
        order: 1,
        tools: { echo },
        prompt: 'ALPHA-RULES',
      }),
      new StubToolSource({
        name: 'b',
        displayName: 'Beta',
        order: 2,
        tools: { b_tool: echo },
        prompt: 'BETA-RULES',
      }),
      new StubToolSource({
        name: 'c',
        displayName: 'Gamma',
        order: 3,
        tools: { c_tool: echo },
        prompt: 'GAMMA-RULES',
      })
    );
    const { instructions } = await buildOrchestrator(
      ctxOf({ projectSystemPrompt: 'Be brief.' }),
      registry
    );
    expect(occurrences(instructions, 'Be brief.')).toBe(1);
    expect(instructions.indexOf('Be brief.')).toBeGreaterThan(
      instructions.indexOf('## Selection rules')
    );
    expect(instructions.indexOf('Be brief.')).toBeLessThan(
      instructions.indexOf('ALPHA-RULES')
    );
    expect(instructions.indexOf('ALPHA-RULES')).toBeLessThan(
      instructions.indexOf('BETA-RULES')
    );
    expect(instructions.indexOf('BETA-RULES')).toBeLessThan(
      instructions.indexOf('GAMMA-RULES')
    );
  });

  it('omits the developer block for a blank project prompt', async () => {
    useMock();
    const registry = createToolSourceRegistry();
    registry.register(new StubToolSource({ name: 'a', tools: { echo } }));
    const { instructions } = await buildOrchestrator(
      ctxOf({ projectSystemPrompt: '  ' }),
      registry
    );
    expect(instructions).not.toContain('developer_instructions');
  });

  it('does not advertise a gated source', async () => {
    useMock();
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({
        name: 'stripe',
        displayName: 'Stripe',
        enabled: false,
        tools: { echo },
        prompt: 'stripe rules',
      }),
      new StubToolSource({
        name: 'a',
        displayName: 'Alpha',
        tools: { b_tool: echo },
      })
    );
    const { instructions, allTools } = await buildOrchestrator(
      ctxOf(),
      registry
    );
    expect(instructions.toLowerCase()).not.toContain('stripe');
    expect(Object.keys(allTools)).toEqual(['b_tool']);
  });

  it('with only the built-in sources it still has the three tools and a valid preamble', async () => {
    useMock();
    const { instructions, allTools } = await buildOrchestrator(
      ctxOf(),
      realRegistry
    );
    expect(Object.keys(allTools).sort()).toEqual([
      'create_entity_link',
      'export_data',
      'visualize_data',
    ]);
    expect(instructions).toContain('## Connected tools');
  });

  it('runs the agent with toolChoice auto and the resolved tools', async () => {
    const mock = useMock();
    const registry = createToolSourceRegistry();
    registry.register(new StubToolSource({ name: 'a', tools: { echo } }));
    const { agent } = await buildOrchestrator(ctxOf(), registry);
    const result = await agent.stream({
      messages: [{ role: 'user', content: 'hi' }],
    });
    await result.consumeStream();
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].toolChoice).toEqual({ type: 'auto' });
    expect(JSON.stringify(mock.calls[0].tools)).toContain('echo');
    expect(JSON.stringify(mock.calls[0].prompt)).toContain(
      'Prioritize the most recent messages'
    );
  });
});

describe('decodeCustomView', () => {
  it('decodes standard and url-safe base64', () => {
    expect(
      decodeCustomView(Buffer.from('/p/products/1').toString('base64'))
    ).toBe('/p/products/1');
    expect(
      decodeCustomView(Buffer.from('/p/products/1').toString('base64url'))
    ).toBe('/p/products/1');
  });

  it('treats a missing or malformed value as an empty URL and warns', () => {
    const logs = captureLogs();
    expect(decodeCustomView('%%%')).toBe('');
    expect(decodeCustomView(undefined)).toBe('');
    expect(decodeCustomView(true)).toBe('');
    logs.stop();
    expect(logs.lines.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildCustomViewOrchestrator', () => {
  const customView = Buffer.from('/p/products/123/variants/456').toString(
    'base64'
  );

  it('puts the decoded URL and the parsing guide into the instructions, project prompt once', async () => {
    useMock();
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'commercetools', tools: { echo } }),
      new StubToolSource({ name: 'stripe', tools: { stripe_tool: echo } })
    );
    const { instructions, allTools } = await buildCustomViewOrchestrator(
      ctxOf({
        projectSystemPrompt: 'Be brief.',
        session: { featureFlags: { customView } },
      }),
      registry
    );
    expect(instructions).toContain('/p/products/123/variants/456');
    expect(instructions).toContain('Examples:');
    expect(occurrences(instructions, 'Be brief.')).toBe(1);
    expect(Object.keys(allTools)).toEqual(['echo']);
  });

  it('a malformed custom view value does not fail the turn', async () => {
    useMock();
    const registry = createToolSourceRegistry();
    registry.register(
      new StubToolSource({ name: 'commercetools', tools: { echo } })
    );
    const logs = captureLogs();
    const { instructions } = await buildCustomViewOrchestrator(
      ctxOf({ session: { featureFlags: { customView: '%%%' } } }),
      registry
    );
    logs.stop();
    expect(instructions).toContain('custom view with the following URL: .');
    expect(logs.lines.join('')).toContain('not valid base64');
  });
});
