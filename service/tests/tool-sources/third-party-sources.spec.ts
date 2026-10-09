/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { asSchema } from '@ai-sdk/provider-utils';
import { tool } from 'ai';
import { z } from 'zod';
import { getCache } from '../../src/cache';
import { algoliaToolSource } from '../../src/tool-sources/algolia/source';
import { CONTENTSTACK_TOOLS } from '../../src/tool-sources/contentstack/constants';
import {
  contentstackToolSource,
  setContentstackFetchForTests,
} from '../../src/tool-sources/contentstack/source';
import { setMcpClientFactoryForTests } from '../../src/tool-sources/mcp-tools';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import {
  STRIPE_TOOL_NAME_BY_KEY,
  STRIPE_TOOLS,
} from '../../src/tool-sources/stripe/constants';
import {
  type StripeToolkitArgs,
  setStripeToolkitFactoryForTests,
  stripeToolSource,
  toActions,
} from '../../src/tool-sources/stripe/source';
import { thirdPartyToolSources } from '../../src/tool-sources/third-party';
import { freshConfig } from '../helpers/env';
import { fakeMcpFactory, offlineMcpFactory } from '../helpers/mcp';
import { makeToolContext } from '../helpers/stub-tool-source';

const contexts: Array<{ dispose: () => void }> = [];
const ctxFor = (
  env: NodeJS.ProcessEnv = {},
  session: Parameters<typeof makeToolContext>[0] = {}
) => {
  const ctx = makeToolContext({ config: freshConfig(env), ...session });
  contexts.push(ctx);
  return ctx;
};

const CS_ENV = {
  CONTENTSTACK_API_KEY: 'cs-key',
  CONTENTSTACK_MANAGEMENT_TOKEN: 'cs-token',
};
const STRIPE_ENV = { STRIPE_SECRET_KEY: 'sk_test_SENTINEL' };
const ALGOLIA_ENV = {
  ALGOLIA_MCP_URL: 'https://mcp.algolia.example.com/path?key=SENTINEL',
};
const dummyTool = tool({
  description: 'd',
  inputSchema: z.object({}),
  execute: async () => 'ok',
});

beforeEach(async () => {
  freshConfig();
  await getCache().clearNamespace('mcp:tools');
});
afterEach(() => {
  while (contexts.length) contexts.pop()?.dispose();
  setMcpClientFactoryForTests(offlineMcpFactory);
  setStripeToolkitFactoryForTests();
  setContentstackFetchForTests();
});

describe('contentstack source', () => {
  it('not configured: disabled, no menu group, no tools, no request', async () => {
    let requests = 0;
    setContentstackFetchForTests(async () => {
      requests += 1;
      return new Response('{}');
    });
    const ctx = ctxFor();
    expect(await contentstackToolSource.isEnabled(ctx)).toBe(false);
    expect(await contentstackToolSource.listForMenu(ctx)).toBeNull();
    expect(await contentstackToolSource.getTools(ctx)).toEqual({});
    expect(requests).toBe(0);
  });

  it('partial set: hidden and nothing attempted', async () => {
    const ctx = ctxFor({ CONTENTSTACK_API_KEY: 'only-key' });
    expect(await contentstackToolSource.isEnabled(ctx)).toBe(false);
    expect(await contentstackToolSource.listForMenu(ctx)).toBeNull();
  });

  it('configured: 15 tools and the 15-name menu group, in the contract order', async () => {
    const ctx = ctxFor(CS_ENV);
    expect(await contentstackToolSource.isEnabled(ctx)).toBe(true);
    const tools = await contentstackToolSource.getTools(ctx);
    expect(Object.keys(tools)).toEqual([...CONTENTSTACK_TOOLS]);
    expect(await contentstackToolSource.listForMenu(ctx)).toEqual({
      toolNames: [...CONTENTSTACK_TOOLS],
    });
    expect(contentstackToolSource.getPrompt(ctx)).toContain('Contentstack');
  });

  it('uses the configured region, branch and credentials', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    setContentstackFetchForTests(async (url, init) => {
      seen.push({
        url: String(url),
        headers: init?.headers as Record<string, string>,
      });
      return new Response(JSON.stringify({ content_types: [] }));
    });
    const ctx = ctxFor({
      ...CS_ENV,
      CONTENTSTACK_REGION: 'eu',
      CONTENTSTACK_BRANCH: 'dev',
    });
    const tools = await contentstackToolSource.getTools(ctx);
    const get = tools.get_all_content_types;
    const parsed = await asSchema((get as { inputSchema: never }).inputSchema)
      .validate!({});
    if (!parsed.success) throw new Error('bad input');
    await (get.execute as (i: unknown, o: unknown) => Promise<unknown>)(
      parsed.value,
      {}
    );
    expect(seen[0].url.startsWith('https://eu-api.contentstack.com/v3/')).toBe(
      true
    );
    expect(seen[0].headers).toMatchObject({
      api_key: 'cs-key',
      authorization: 'cs-token',
      branch: 'dev',
    });
  });
});

describe('algolia source', () => {
  it('not configured: nothing', async () => {
    const ctx = ctxFor();
    expect(await algoliaToolSource.isEnabled(ctx)).toBe(false);
    expect(await algoliaToolSource.listForMenu(ctx)).toBeNull();
    expect(await algoliaToolSource.getTools(ctx)).toEqual({});
  });

  it('a private URL disables Algolia at startup, so no handshake can happen', async () => {
    const factory = fakeMcpFactory({ tools: { search: dummyTool } });
    setMcpClientFactoryForTests(factory);
    const ctx = ctxFor({ ALGOLIA_MCP_URL: 'https://169.254.169.254/mcp' });
    expect(await algoliaToolSource.isEnabled(ctx)).toBe(false);
    expect(await algoliaToolSource.getTools(ctx)).toEqual({});
    expect(factory.configs).toHaveLength(0);
  });

  it('a private URL at use time (defence in depth): {} + warning with host only, no request', async () => {
    const factory = fakeMcpFactory({ tools: { search: dummyTool } });
    setMcpClientFactoryForTests(factory);
    const ctx = ctxFor(ALGOLIA_ENV);
    // Simulate a config that bypassed the section validation.
    const forged = {
      ...ctx,
      config: {
        ...ctx.config,
        providers: {
          ...ctx.config.providers,
          algolia: {
            url: { reveal: () => 'https://10.0.0.5/secret-path?key=SENTINEL' },
          },
        },
      },
    } as unknown as typeof ctx;
    expect(await algoliaToolSource.getTools(forged)).toEqual({});
    expect(factory.configs).toHaveLength(0);
    const warned = ctx.log.warnings.join('\n');
    expect(warned).toContain('host=10.0.0.5');
    expect(warned).not.toContain('SENTINEL');
    expect(warned).not.toContain('secret-path');
  });

  it('connects with redirect "error", returns the server tools, menu is the all_tools switch', async () => {
    const factory = fakeMcpFactory({
      tools: { algolia_search: dummyTool, algolia_settings: dummyTool },
    });
    setMcpClientFactoryForTests(factory);
    const ctx = ctxFor(ALGOLIA_ENV);
    const tools = await algoliaToolSource.getTools(ctx);
    expect(Object.keys(tools)).toEqual(['algolia_search', 'algolia_settings']);
    expect(factory.configs[0].redirect).toBe('error');
    expect(factory.configs[0].url).toBe(
      'https://mcp.algolia.example.com/path?key=SENTINEL'
    );
    expect(await algoliaToolSource.listForMenu(ctx)).toEqual({
      toolNames: ['all_tools'],
    });
  });

  it('handshake failure: {} and a log with no URL', async () => {
    setMcpClientFactoryForTests(
      fakeMcpFactory({ failTools: new Error('boom SENTINEL') })
    );
    const ctx = ctxFor(ALGOLIA_ENV);
    expect(await algoliaToolSource.getTools(ctx)).toEqual({});
    const warned = ctx.log.warnings.join('\n');
    expect(warned).toContain('MCP_HANDSHAKE_FAILED source=algolia');
    expect(warned).not.toContain('SENTINEL');
    expect(warned).not.toContain('algolia.example.com');
  });

  it('the registry never calls getTools when all_tools is switched off (no handshake)', async () => {
    const factory = fakeMcpFactory({ tools: { algolia_search: dummyTool } });
    setMcpClientFactoryForTests(factory);
    const registry = createToolSourceRegistry();
    registry.register(algoliaToolSource);

    const off = await registry.resolve(
      ctxFor(ALGOLIA_ENV, {
        session: { disabledTools: { algolia: ['all_tools'] } },
      })
    );
    expect(off.tools).toEqual({});
    expect(off.fragments).toEqual([]);
    expect(factory.configs).toHaveLength(0);

    const on = await registry.resolve(ctxFor(ALGOLIA_ENV));
    expect(Object.keys(on.tools)).toEqual(['algolia_search']);
    expect(factory.configs).toHaveLength(1);
  });
});

describe('stripe source', () => {
  const stubFactory = () => {
    const calls: StripeToolkitArgs[] = [];
    setStripeToolkitFactoryForTests((args) => {
      calls.push(args);
      return {
        tools: Object.fromEntries(
          Object.keys(STRIPE_TOOL_NAME_BY_KEY).map((key) => [
            key,
            {
              description: key,
              parameters: z.object({ id: z.string() }),
              execute: async () => key,
            },
          ])
        ),
      };
    });
    return calls;
  };

  it('not configured: nothing, and the toolkit is never built', async () => {
    const calls = stubFactory();
    const ctx = ctxFor();
    expect(await stripeToolSource.isEnabled(ctx)).toBe(false);
    expect(await stripeToolSource.listForMenu(ctx)).toBeNull();
    expect(await stripeToolSource.getTools(ctx)).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it('requests all 24 actions and passes the connected account as context', async () => {
    const calls = stubFactory();
    await stripeToolSource.getTools(
      ctxFor({ ...STRIPE_ENV, STRIPE_CONNECTED_ACCOUNT_ID: 'acct_123' })
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].secretKey).toBe('sk_test_SENTINEL');
    expect(calls[0].configuration.context).toEqual({ account: 'acct_123' });
    const requested = Object.entries(calls[0].configuration.actions).flatMap(
      ([r, acts]) => Object.keys(acts).map((a) => `${r}.${a}`)
    );
    expect(requested.sort()).toEqual([...STRIPE_TOOLS].sort());
    expect(requested).toHaveLength(24);
  });

  it('without a connected account there is no context', async () => {
    const calls = stubFactory();
    await stripeToolSource.getTools(ctxFor(STRIPE_ENV));
    expect(calls[0].configuration.context).toBeUndefined();
  });

  it('memoises one toolkit per process for an unchanged configuration', async () => {
    const calls = stubFactory();
    await stripeToolSource.getTools(ctxFor(STRIPE_ENV));
    await stripeToolSource.getTools(ctxFor(STRIPE_ENV));
    expect(calls).toHaveLength(1);
  });

  it('menu lists the 24 names; tool keys are menu names with an argument schema', async () => {
    stubFactory();
    const ctx = ctxFor(STRIPE_ENV);
    const menu = await stripeToolSource.listForMenu(ctx);
    expect(menu?.toolNames).toHaveLength(24);
    const tools = await stripeToolSource.getTools(ctx);
    for (const name of Object.keys(tools)) {
      expect(menu?.toolNames.concat('subscriptions.cancel')).toContain(name);
    }
    for (const tool of Object.values(tools)) {
      expect((tool as { parameters?: unknown }).parameters).toBeUndefined();
      const js = asSchema((tool as { inputSchema: never }).inputSchema)
        .jsonSchema as { properties?: object };
      expect(Object.keys(js.properties ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('a read-only session leaves only the read tools (registry filters by menu name)', async () => {
    stubFactory();
    const registry = createToolSourceRegistry();
    registry.register(stripeToolSource);
    const disabled = STRIPE_TOOLS.filter(
      (n) => n.endsWith('.create') || n.endsWith('.update')
    );
    const { tools } = await registry.resolve(
      ctxFor(STRIPE_ENV, { session: { disabledTools: { stripe: disabled } } })
    );
    const names = Object.keys(tools);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.endsWith('.read')).toBe(true);
  });

  it('subscriptions.cancel (mutating) follows the subscriptions.update switch', async () => {
    stubFactory();
    const on = await stripeToolSource.getTools(ctxFor(STRIPE_ENV));
    expect(on['subscriptions.cancel']).toBeDefined();
    const off = await stripeToolSource.getTools(
      ctxFor(STRIPE_ENV, {
        session: { disabledTools: { stripe: ['subscriptions.update'] } },
      })
    );
    expect(off['subscriptions.cancel']).toBeUndefined();
    expect(off['subscriptions.read']).toBeDefined();
  });

  it('an unknown toolkit key is dropped with a warning (never exposed unswitchable)', async () => {
    setStripeToolkitFactoryForTests(() => ({
      tools: {
        brand_new_tool: {
          description: 'x',
          parameters: z.object({}),
          execute: async () => 'x',
        },
      },
    }));
    const ctx = ctxFor(STRIPE_ENV);
    expect(await stripeToolSource.getTools(ctx)).toEqual({});
    expect(ctx.log.warnings.join('\n')).toContain(
      'STRIPE_TOOL_UNMAPPED key=brand_new_tool'
    );
  });

  it('a toolkit that throws: {} and a log with the class only', async () => {
    setStripeToolkitFactoryForTests(() => {
      throw new TypeError('bad key sk_test_SENTINEL');
    });
    const ctx = ctxFor(STRIPE_ENV);
    expect(await stripeToolSource.getTools(ctx)).toEqual({});
    const warned = ctx.log.warnings.join('\n');
    expect(warned).toContain(
      'TOOLSOURCE_FAILED provider=stripe class=TypeError'
    );
    expect(warned).not.toContain('SENTINEL');
    expect(warned).not.toMatch(/sk_|rk_/);
  });

  it('toActions groups resource.action names', () => {
    expect(
      toActions(['customers.create', 'customers.read', 'balance.read'])
    ).toEqual({
      customers: { create: true, read: true },
      balance: { read: true },
    });
  });
});

describe('stripe source with the REAL @stripe/agent-toolkit@0.7.12', () => {
  it('every tool ends up with an argument schema, and every key is mapped', async () => {
    const ctx = ctxFor(STRIPE_ENV);
    const tools = await stripeToolSource.getTools(ctx);
    const names = Object.keys(tools);
    expect(names).toHaveLength(Object.keys(STRIPE_TOOL_NAME_BY_KEY).length);
    expect(
      ctx.log.warnings.filter((w) => w.includes('STRIPE_TOOL_UNMAPPED'))
    ).toEqual([]);
    for (const name of names) {
      const t = tools[name] as unknown as {
        inputSchema?: never;
        parameters?: unknown;
      };
      expect(t.parameters).toBeUndefined();
      const js = asSchema(t.inputSchema as never).jsonSchema as {
        type?: string;
        properties?: Record<string, unknown>;
      };
      expect(js.type).toBe('object');
      expect(js.properties).toBeDefined();
    }
    // The menu names that map to a real tool.
    const menu = (await stripeToolSource.listForMenu(ctx))?.toolNames ?? [];
    for (const name of names.filter((n) => n !== 'subscriptions.cancel')) {
      expect(menu).toContain(name);
    }
  });
});

describe('third-party sources: contract', () => {
  it('names, order and descriptions', () => {
    expect(thirdPartyToolSources.map((s) => [s.name, s.order])).toEqual([
      ['commercetools-knowledge', 20],
      ['contentstack', 30],
      ['algolia', 40],
      ['stripe', 50],
    ]);
    for (const s of thirdPartyToolSources) {
      expect((s.description ?? '').length).toBeGreaterThan(20);
      expect(s.description).not.toContain('\n');
    }
  });

  it('menu groups appear in order and unconfigured providers are absent', async () => {
    setMcpClientFactoryForTests(fakeMcpFactory({ tools: { kn: dummyTool } }));
    const registry = createToolSourceRegistry();
    registry.register(...thirdPartyToolSources);
    const groups = await registry.listMenuGroups(
      ctxFor({ ...CS_ENV, ...STRIPE_ENV })
    );
    expect(groups.map((g) => g.mcp)).toEqual([
      'commercetools-knowledge',
      'contentstack',
      'stripe',
    ]);
    expect(groups[1].toolNames).toHaveLength(15);
    expect(groups[2].toolNames).toHaveLength(24);
  });

  it('a throwing source does not affect the others', async () => {
    setStripeToolkitFactoryForTests(() => {
      throw new Error('boom');
    });
    setMcpClientFactoryForTests(
      fakeMcpFactory({ tools: { kn_search: dummyTool } })
    );
    const registry = createToolSourceRegistry();
    registry.register(...thirdPartyToolSources);
    const { tools } = await registry.resolve(
      ctxFor({ ...CS_ENV, ...STRIPE_ENV })
    );
    expect(tools.kn_search).toBeDefined();
    expect(tools.create_entry).toBeDefined();
  });

  it('only the three integrations count as connected sources', async () => {
    const registry = createToolSourceRegistry();
    registry.register(...thirdPartyToolSources);
    expect(
      await registry.listConnectedSourceNames(ctxFor({ ...CS_ENV }))
    ).toEqual(['contentstack']);
  });
});
