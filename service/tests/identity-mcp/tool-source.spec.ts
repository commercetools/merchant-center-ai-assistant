/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { CACHE_NS, getCache } from '../../src/cache';
import { setIdentityRuntimeForTests } from '../../src/identity-mcp/runtime';
import {
  commercetoolsToolSource as source,
  NOT_CONNECTED_TOOL,
} from '../../src/identity-mcp/tool-source';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { freshConfig } from '../helpers/env';
import { StubToolSource, makeToolContext } from '../helpers/stub-tool-source';
import { auth2Responder, fakeMcp, routedFetch } from './fake-network';
import {
  bindingFixture,
  fakeAuth2,
  makeRig,
  tokenRecordFixture,
  USER_ID,
  type Rig,
} from './helpers';

const ctxFor = (rig: Rig, session = {}) =>
  makeToolContext({
    user: { userId: USER_ID, projectKey: 'p', isAdmin: false },
    stores: rig.persistence,
    config: rig.config,
    session,
  });

const withNetwork = (rig: Rig, tools = ['read_orders', 'delete_orders']) => {
  const mcp = fakeMcp({ tools });
  const net = routedFetch(mcp.responder, auth2Responder(fakeAuth2()));
  setIdentityRuntimeForTests({
    config: rig.config,
    stores: rig.stores,
    fetchFn: net.fetchFn,
  });
  return mcp;
};

afterEach(async () => {
  setIdentityRuntimeForTests(undefined);
  await getCache().clearNamespace(CACHE_NS.MCP_IDENTITY_TOOLS);
});

const connected = async (rig: Rig) => {
  await rig.stores.binding.set(bindingFixture());
  await rig.stores.tokens.put(tokenRecordFixture());
};

beforeEach(() => {
  freshConfig();
});

describe('commercetools tool source', () => {
  it('has the documented identity', () => {
    expect(source.name).toBe('commercetools');
    expect(source.displayName).toBe('commercetools Commerce');
  });

  it('isEnabled follows the binding', async () => {
    const rig = makeRig();
    const ctx = ctxFor(rig);
    expect(await source.isEnabled(ctx)).toBe(false);
    await rig.stores.binding.set(bindingFixture());
    expect(await source.isEnabled(ctx)).toBe(true);
    ctx.dispose();
  });

  it('a connected user gets ALL tools from the source (filtering is the registry job)', async () => {
    const rig = makeRig();
    await connected(rig);
    withNetwork(rig);
    const ctx = ctxFor(rig, {
      disabledTools: { commercetools: ['delete_orders'] },
    });
    expect(Object.keys(await source.getTools(ctx)).sort()).toEqual([
      'delete_orders',
      'read_orders',
    ]);
    expect(source.getPrompt(ctx)).not.toContain('Connect my account');

    const registry = createToolSourceRegistry();
    registry.register(source);
    const resolved = await registry.resolve(ctx);
    expect(Object.keys(resolved.tools)).toEqual(['read_orders']);
    expect(resolved.fragments.join('')).toContain('commercetools');
    ctx.dispose();
  });

  it('a user without a token gets exactly the placeholder tool and the reconnect prompt', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    withNetwork(rig);
    const ctx = ctxFor(rig);
    const tools = await source.getTools(ctx);
    expect(Object.keys(tools)).toEqual([NOT_CONNECTED_TOOL]);
    expect(source.getPrompt(ctx)).toContain('Connect my account');

    const run = (
      tools[NOT_CONNECTED_TOOL] as {
        execute: (a: unknown, o: unknown) => Promise<unknown>;
      }
    ).execute;
    expect(await run({}, {})).toMatchObject({
      success: false,
      code: 'IDENTITY_REAUTH_REQUIRED',
    });

    // The registry keeps the prompt because the source contributed a tool.
    const registry = createToolSourceRegistry();
    registry.register(source);
    const ctx2 = ctxFor(rig);
    const resolved = await registry.resolve(ctx2);
    expect(Object.keys(resolved.tools)).toEqual([NOT_CONNECTED_TOOL]);
    expect(resolved.fragments.join('')).toContain('Connect my account');
    ctx.dispose();
    ctx2.dispose();
  });

  it('a user with no permitted tools gets the placeholder with the matching code', async () => {
    const rig = makeRig();
    await connected(rig);
    const net = routedFetch(
      fakeMcp({
        toolsListResponse: () =>
          new Response('{}', {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      }).responder
    );
    setIdentityRuntimeForTests({
      config: rig.config,
      stores: rig.stores,
      fetchFn: net.fetchFn,
    });
    const ctx = ctxFor(rig);
    const tools = await source.getTools(ctx);
    expect(Object.keys(tools)).toEqual([NOT_CONNECTED_TOOL]);
    expect(source.getPrompt(ctx)).toContain('NO PERMITTED TOOLS');
    ctx.dispose();
  });

  it('listForMenu: names only, empty when not connected, null without a binding', async () => {
    const rig = makeRig();
    const ctx = ctxFor(rig);
    expect(await source.listForMenu(ctx)).toBeNull();

    await rig.stores.binding.set(bindingFixture());
    expect(await source.listForMenu(ctx)).toEqual({ toolNames: [] });

    await rig.stores.tokens.put(tokenRecordFixture());
    withNetwork(rig, ['read_orders']);
    expect(await source.listForMenu(ctx)).toEqual({
      toolNames: ['read_orders'],
    });
    ctx.dispose();
  });

  it('an unexpected error propagates; the registry isolates it', async () => {
    const rig = makeRig();
    await rig.stores.binding.set(bindingFixture());
    const broken = {
      ...rig.persistence,
      settings: {
        ...rig.persistence.settings,
        get: async () => {
          throw new Error('storage exploded');
        },
      },
    } as unknown as Rig['persistence'];
    const ctx = makeToolContext({ stores: broken, config: rig.config });
    await expect(source.getTools(ctx)).rejects.toThrow('storage exploded');

    const registry = createToolSourceRegistry();
    registry.register(source, new StubToolSource({ name: 'other', tools: {} }));
    const resolved = await registry.resolve(ctx);
    expect(resolved.tools).toEqual({});
    ctx.dispose();
  });
});
