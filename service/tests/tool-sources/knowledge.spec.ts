/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { getCache } from '../../src/cache';
import { setMcpClientFactoryForTests } from '../../src/tool-sources/mcp-tools';
import { KNOWLEDGE_TOOLS } from '../../src/tool-sources/knowledge/constants';
import { knowledgeToolSource } from '../../src/tool-sources/knowledge/source';
import { resetTipsForTests } from '../../src/tool-sources/knowledge/tips';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { fakeMcpFactory, offlineMcpFactory } from '../helpers/mcp';
import { freshConfig } from '../helpers/env';
import { makeToolContext } from '../helpers/stub-tool-source';

const fakeTool = tool({
  description: 'd',
  inputSchema: z.object({}),
  execute: async () => 'ok',
});
const sixTools: ToolSet = Object.fromEntries(
  KNOWLEDGE_TOOLS.map((n) => [n, fakeTool])
);
const TIPS = 'Use keys, not ids. Money is centAmount.';

const contexts: Array<{ dispose: () => void }> = [];
const ctxFor = (...args: Parameters<typeof makeToolContext>) => {
  const ctx = makeToolContext(...args);
  contexts.push(ctx);
  return ctx;
};

beforeEach(async () => {
  freshConfig();
  resetTipsForTests();
  await getCache().clearNamespace('mcp:tools');
});
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
  setMcpClientFactoryForTests(offlineMcpFactory);
});

describe('knowledge source', () => {
  it('has the contract name and is always enabled', async () => {
    expect(knowledgeToolSource.name).toBe('commercetools-knowledge');
    expect(knowledgeToolSource.description).toBeTruthy();
    expect(await knowledgeToolSource.isEnabled(ctxFor())).toBe(true);
  });

  it('returns the six tools, follows redirects of the fixed host, no credentials', async () => {
    const factory = fakeMcpFactory({
      tools: sixTools,
      prompts: { 'commercetools-developer-tips': TIPS },
    });
    setMcpClientFactoryForTests(factory);
    const tools = await knowledgeToolSource.getTools(ctxFor());
    expect(Object.keys(tools).sort()).toEqual([...KNOWLEDGE_TOOLS].sort());
    const toolsCall = factory.configs.find(
      (c) => c.url === 'https://docs.commercetools.com/apis/mcp'
    );
    expect(toolsCall?.redirect).toBe('follow');
    expect(toolsCall?.headers).toBeUndefined();
  });

  it('a failed handshake gives {} and does not throw', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({ failTools: new Error('503') })
    );
    const ctx = ctxFor();
    expect(await knowledgeToolSource.getTools(ctx)).toEqual({});
    expect(ctx.log.warnings.join('\n')).toContain(
      'MCP_HANDSHAKE_FAILED source=commercetools-knowledge'
    );
    expect(ctx.log.warnings.join('\n')).not.toContain('503');
  });

  it('a slow handshake gives {} after the deadline and still fills the cache', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({ tools: sixTools, toolsDelayMs: 80 })
    );
    const slowCtx = ctxFor({
      config: freshConfig({ MCP_HANDSHAKE_TIMEOUT_MS: '20' }),
    });
    expect(await knowledgeToolSource.getTools(slowCtx)).toEqual({});
    await new Promise((resolve) => setTimeout(resolve, 150));
    const later = await knowledgeToolSource.getTools(ctxFor());
    expect(Object.keys(later)).toHaveLength(6);
  });

  it('tips block is present after getTools and empty when the fetch failed', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({
        tools: sixTools,
        prompts: { 'commercetools-developer-tips': TIPS },
      })
    );
    const ctx = ctxFor();
    expect(knowledgeToolSource.getPrompt(ctx)).toBe('');
    await knowledgeToolSource.getTools(ctx);
    expect(knowledgeToolSource.getPrompt(ctx)).toBe(
      `<commercetools_api_tips>\n${TIPS}\n</commercetools_api_tips>`
    );

    resetTipsForTests();
    await getCache().clearNamespace('mcp:tools');
    setMcpClientFactoryForTests(fakeMcpFactory({ tools: sixTools }));
    await knowledgeToolSource.getTools(ctx);
    expect(knowledgeToolSource.getPrompt(ctx)).toBe('');
  });

  it('getPrompt never waits on the network', () => {
    setMcpClientFactoryForTests(() => {
      throw new Error('must not be called');
    });
    expect(knowledgeToolSource.getPrompt(ctxFor())).toBe('');
  });

  it('logs drift (added and removed tools) and still uses the live set', async () => {
    const live: ToolSet = { ...sixTools, 'brand-new-tool': fakeTool };
    delete live['commercetools-rest-validate'];
    setMcpClientFactoryForTests(fakeMcpFactory({ tools: live }));
    const ctx = ctxFor();
    const tools = await knowledgeToolSource.getTools(ctx);
    expect(Object.keys(tools)).toContain('brand-new-tool');
    const warned = ctx.log.warnings.join('\n');
    expect(warned).toContain('brand-new-tool');
    expect(warned).toContain('commercetools-rest-validate');
  });

  it('menu: live names, or the six expected names when the handshake fails', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({ tools: { only_one: fakeTool } })
    );
    expect(await knowledgeToolSource.listForMenu(ctxFor())).toEqual({
      toolNames: ['only_one'],
    });
    await getCache().clearNamespace('mcp:tools');
    setMcpClientFactoryForTests(offlineMcpFactory);
    expect(await knowledgeToolSource.listForMenu(ctxFor())).toEqual({
      toolNames: [...KNOWLEDGE_TOOLS],
    });
  });
});

describe('knowledge source through the registry', () => {
  const registryWith = () => {
    const registry = createToolSourceRegistry();
    registry.register(knowledgeToolSource);
    return registry;
  };

  it('disabling one tool removes it, the source still returns all six', async () => {
    setMcpClientFactoryForTests(fakeMcpFactory({ tools: sixTools }));
    const ctx = ctxFor({
      session: {
        disabledTools: {
          'commercetools-knowledge': ['commercetools-rest-validate'],
        },
      },
    });
    const { tools } = await registryWith().resolve(ctx);
    expect(Object.keys(tools)).toHaveLength(5);
    expect(tools['commercetools-rest-validate']).toBeUndefined();
    expect(Object.keys(await knowledgeToolSource.getTools(ctx))).toHaveLength(
      6
    );
  });

  it('disabling every tool removes the tips from the instructions', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({
        tools: sixTools,
        prompts: { 'commercetools-developer-tips': TIPS },
      })
    );
    const on = await registryWith().resolve(ctxFor());
    expect(on.fragments.join('')).toContain('<commercetools_api_tips>');

    const off = await registryWith().resolve(
      ctxFor({
        session: {
          disabledTools: { 'commercetools-knowledge': [...KNOWLEDGE_TOOLS] },
        },
      })
    );
    expect(off.tools).toEqual({});
    expect(off.fragments).toEqual([]);
  });

  it('an unreachable endpoint contributes nothing and the resolve completes', async () => {
    const { tools, contributing } = await registryWith().resolve(ctxFor());
    expect(tools).toEqual({});
    expect(contributing).toEqual([]);
  });
});
