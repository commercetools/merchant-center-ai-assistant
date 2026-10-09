/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { CACHE_NS, getCache } from '../../src/cache';
import { MemoryCache } from '../../src/cache/memory-cache';
import {
  IdentityNoPermittedToolsError,
  IdentityReauthRequiredError,
} from '../../src/identity-mcp/errors';
import { identityToolsCacheKey } from '../../src/identity-mcp/keys';
import {
  callIdentityMcpTool,
  getIdentityMcpToolSet,
  invalidateAllToolSets,
  invalidateToolSetsForUser,
} from '../../src/identity-mcp/toolset';
import type {
  CreateMcpClient,
  IdentityToolSetDeps,
} from '../../src/identity-mcp/toolset';
import { captureLogs } from '../helpers/log-capture';
import { auth2Responder, fakeMcp, routedFetch } from './fake-network';
import type { Responder } from './fake-network';
import {
  bindingFixture,
  fakeAuth2,
  legacyClient,
  makeRig,
  tokenRecordFixture,
  type Rig,
} from './helpers';

const cache = () =>
  new MemoryCache({ maxEntries: 100, sweepMs: 60_000, sweep: false });

async function connectedRig(userIds: string[]) {
  const rig = makeRig();
  await rig.stores.binding.set(bindingFixture());
  for (const userId of userIds) {
    await rig.stores.tokens.put(
      tokenRecordFixture({ userId }, { access_token: `access-of-${userId}` })
    );
  }
  const binding = (await rig.stores.binding.get())!;
  return { rig, binding };
}

let fetchFn: typeof fetch | undefined;
const network = (...responders: Responder[]): void => {
  fetchFn = routedFetch(...responders).fetchFn;
};

const depsOf = (
  rig: Rig,
  c = cache(),
  createClient?: CreateMcpClient
): IdentityToolSetDeps => ({
  config: rig.config,
  stores: rig.stores,
  cache: c,
  createClient,
  fetchFn,
});

describe('per-user tool sets against a fake identity-mode MCP server', () => {
  it('each user gets its own entry and bearer; a second call within the TTL is cached', async () => {
    const { rig, binding } = await connectedRig(['user-a', 'user-b']);
    const mcp = fakeMcp({ tools: ['read_orders', 'create_orders'] });
    network(mcp.responder);
    const deps = depsOf(rig);

    const a = await getIdentityMcpToolSet('user-a', binding, deps);
    const b = await getIdentityMcpToolSet('user-b', binding, deps);
    expect(a?.cached).toBe(false);
    expect(a?.toolNames).toEqual(['create_orders', 'read_orders']);
    expect(b?.tools).not.toBe(a?.tools);
    expect(new Set(mcp.requests.map((r) => r.bearer))).toEqual(
      new Set(['access-of-user-a', 'access-of-user-b'])
    );

    const listCalls = mcp.count('tools/list');
    const again = await getIdentityMcpToolSet('user-a', binding, deps);
    expect(again?.cached).toBe(true);
    expect(again?.tools).toBe(a?.tools);
    expect(mcp.count('tools/list')).toBe(listCalls);
  });

  it('a tampered owner discards the entry, logs an error and handshakes again', async () => {
    const { rig, binding } = await connectedRig(['user-a']);
    const mcp = fakeMcp();
    network(mcp.responder);
    const c = cache();
    const deps = depsOf(rig, c);
    await getIdentityMcpToolSet('user-a', binding, deps);

    const key = identityToolsCacheKey('user-a', binding);
    const entry = await c.get<Record<string, unknown>>(
      CACHE_NS.MCP_IDENTITY_TOOLS,
      key
    );
    await c.set(
      CACHE_NS.MCP_IDENTITY_TOOLS,
      key,
      { ...entry, ownerUserId: 'user-b' },
      60_000
    );

    const logs = captureLogs();
    const result = await getIdentityMcpToolSet('user-a', binding, deps);
    expect(result?.cached).toBe(false);
    expect(logs.lines.join('')).toContain('TOOLS_CACHE_OWNER_MISMATCH');
    logs.stop();
  });

  it('a rebind changes the key; invalidation drops one user or everybody', async () => {
    const { rig, binding } = await connectedRig(['user-a', 'user-b']);
    network(fakeMcp().responder);
    const c = cache();
    const deps = depsOf(rig, c);
    await getIdentityMcpToolSet('user-a', binding, deps);
    await getIdentityMcpToolSet('user-b', binding, deps);
    expect(c.stats().namespaces.mcp).toBe(2);

    expect(identityToolsCacheKey('user-a', binding)).not.toBe(
      identityToolsCacheKey('user-a', {
        ...binding,
        connectedAt: binding.connectedAt + 1,
      })
    );

    await invalidateToolSetsForUser('user-a', c);
    expect(c.stats().namespaces.mcp).toBe(1);
    await invalidateAllToolSets(c);
    expect(c.stats().namespaces.mcp ?? 0).toBe(0);
  });

  it('a missing or malformed user id throws before any key is built', async () => {
    const { rig, binding } = await connectedRig([]);
    for (const bad of ['', 'a:b', undefined as unknown as string]) {
      await expect(
        getIdentityMcpToolSet(bad, binding, depsOf(rig))
      ).rejects.toThrow(/implausible user id/);
    }
  });

  it('no stored token -> IdentityReauthRequiredError(no-token), without starting an attempt', async () => {
    const { rig, binding } = await connectedRig([]);
    network(fakeMcp().responder, auth2Responder(fakeAuth2()));
    await expect(
      getIdentityMcpToolSet('user-a', binding, depsOf(rig))
    ).rejects.toMatchObject({
      name: 'IdentityReauthRequiredError',
      reason: 'no-token',
    });
    const states = await rig.persistence.gateway.query(
      'ai-assistant-identity-auth-states',
      {
        limit: 5,
      }
    );
    expect(states.results).toHaveLength(0);
  });

  it('a rejected token and a failed refresh -> refresh-failed and the record is deleted', async () => {
    const { rig } = await connectedRig(['user-a']);
    await rig.stores.binding.setClient(legacyClient());
    const binding = (await rig.stores.binding.get())!;
    const logs = captureLogs();
    network(
      fakeMcp({ acceptToken: () => false }).responder,
      auth2Responder(fakeAuth2({ tokenStatus: 400 }))
    );
    await expect(
      getIdentityMcpToolSet('user-a', binding, depsOf(rig))
    ).rejects.toBeInstanceOf(IdentityReauthRequiredError);
    expect(logs.lines.join('')).toContain('INVALIDATE scope=tokens');
    logs.stop();
    expect(await rig.stores.tokens.get('user-a')).toBeNull();
  });

  it('a 403 from the server -> IdentityNoPermittedToolsError', async () => {
    const { rig, binding } = await connectedRig(['user-a']);
    network(
      fakeMcp({
        toolsListResponse: () =>
          new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      }).responder
    );
    await expect(
      getIdentityMcpToolSet('user-a', binding, depsOf(rig))
    ).rejects.toBeInstanceOf(IdentityNoPermittedToolsError);
  });

  it('zero tools is logged TOOLS_ZERO and still returned', async () => {
    const { rig, binding } = await connectedRig(['user-a']);
    network(fakeMcp({ tools: [] }).responder);
    const logs = captureLogs();
    const result = await getIdentityMcpToolSet('user-a', binding, depsOf(rig));
    expect(result?.toolNames).toEqual([]);
    expect(logs.lines.join('')).toContain('TOOLS_ZERO');
    logs.stop();
  });

  it('callIdentityMcpTool re-resolves and lists the available tools for an unknown name', async () => {
    const { rig, binding } = await connectedRig(['user-a']);
    network(fakeMcp({ tools: ['read_orders'] }).responder);
    await expect(
      callIdentityMcpTool(
        'user-a',
        binding,
        depsOf(rig),
        'delete_everything',
        {}
      )
    ).rejects.toThrow(/not exposed to this user. Available: read_orders/);
  });
});

describe('error mapping with a stubbed client factory', () => {
  const failing = (error: Error): CreateMcpClient =>
    (async () => {
      throw error;
    }) as unknown as CreateMcpClient;

  it.each([
    ['UnauthorizedError', () => Object.assign(new Error('x'), {}), 'reauth'],
    [
      'a 403 status',
      () => Object.assign(new Error('Forbidden'), { statusCode: 403 }),
      'none',
    ],
    [
      'a "not permitted" message',
      () => new Error('No configured tools are permitted for you'),
      'none',
    ],
    ['anything else', () => new Error('socket hang up'), 'null'],
  ])('%s', async (label, make, expectation) => {
    const { rig, binding } = await connectedRig(['user-a']);
    let error = make();
    if (label === 'UnauthorizedError') {
      class UnauthorizedError extends Error {}
      error = new UnauthorizedError('unauthorized');
    }
    const logs = captureLogs();
    const run = getIdentityMcpToolSet(
      'user-a',
      binding,
      depsOf(rig, cache(), failing(error))
    );
    if (expectation === 'reauth') {
      await expect(run).rejects.toBeInstanceOf(IdentityReauthRequiredError);
    } else if (expectation === 'none') {
      await expect(run).rejects.toBeInstanceOf(IdentityNoPermittedToolsError);
    } else {
      await expect(run).resolves.toBeNull();
      expect(logs.lines.join('')).toMatch(
        /TOOLS_HANDSHAKE_FAILED class=Error ms=\d+/
      );
    }
    logs.stop();
  });

  it('the default cache is the shared memory cache', () => {
    expect(typeof getCache().get).toBe('function');
  });
});
