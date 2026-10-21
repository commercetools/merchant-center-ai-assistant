/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { CACHE_NS, getCache } from '../../src/cache';
import { runContributors } from '../../src/auth/bootstrap-registry';
import type { AuthenticatedRequest } from '../../src/types/request.types';
import { asUser, makeIdentityApp, resetIdentityApp } from './app';
import { auth2Responder, fakeMcp, routedFetch } from './fake-network';
import type { Responder } from './fake-network';
import {
  AS_ORIGIN,
  bindingFixture,
  CONNECTED_AT,
  fakeAuth2,
  legacyClient,
  MCP_URL,
  REGION,
  SERVER_KEY,
  tokenRecordFixture,
} from './helpers';

const BASE = '/service/managed-mcp-identity';
const ADMIN = asUser('admin-1', true);
const MEMBER = asUser('member-1', false);

/** Identity-mode server: the probe sees auth2. */
const identityNetwork = (): { fetchFn: typeof fetch; calls: string[] } => {
  const net = routedFetch(fakeMcp().responder, auth2Responder(fakeAuth2()));
  return { fetchFn: net.fetchFn, calls: net.calls };
};

/** A ClientCredentials-mode server: the template metadata names `auth.{region}`. */
const clientCredentialsNetwork = (): {
  fetchFn: typeof fetch;
  calls: string[];
} => {
  const ccAuth = `https://auth.${REGION}.commercetools.com`;
  const prm: Responder = (url) =>
    url.pathname.startsWith('/.well-known/oauth-protected-resource')
      ? new Response(
          JSON.stringify({
            resource: MCP_URL,
            authorization_servers: [ccAuth],
          }),
          {
            status: 200,
          }
        )
      : undefined;
  const asMeta: Responder = (url) =>
    url.origin === ccAuth
      ? new Response(
          JSON.stringify({
            issuer: ccAuth,
            grant_types_supported: ['client_credentials'],
          }),
          {
            status: 200,
          }
        )
      : undefined;
  const mcp = fakeMcp().responder;
  const net = routedFetch(prm, asMeta, mcp);
  return { fetchFn: net.fetchFn, calls: net.calls };
};

afterEach(async () => {
  resetIdentityApp();
  await getCache().clearNamespace(CACHE_NS.MCP_IDENTITY_TOOLS);
});

describe('GET /managed-mcp-identity', () => {
  it('404 IDENTITY_MCP_NOT_CONFIGURED on a fresh deployment', async () => {
    const { app } = makeIdentityApp(identityNetwork().fetchFn);
    const res = await request(app).get(BASE).set(MEMBER);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      code: 'IDENTITY_MCP_NOT_CONFIGURED',
    });
  });

  it('returns the public binding without client or encrypted data', async () => {
    const { app, rig } = makeIdentityApp(identityNetwork().fetchFn);
    await rig.stores.binding.set(
      bindingFixture({
        discovery: { authorizationServers: [AS_ORIGIN], probedAt: 1 },
      })
    );
    await rig.stores.binding.setClient(legacyClient());

    const res = await request(app).get(BASE).set(MEMBER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      serverKey: SERVER_KEY,
      url: MCP_URL,
      authenticationMode: 'CommercetoolsIdentity',
      connectedAt: CONNECTED_AT,
    });
    const text = JSON.stringify(res.body);
    for (const forbidden of [
      'client',
      'refresh_token',
      'encrypted',
      'secret-abc',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('PUT /managed-mcp-identity', () => {
  it('a non-admin gets 403 ADMIN_REQUIRED and no request leaves the service', async () => {
    const net = identityNetwork();
    const { app, rig } = makeIdentityApp(net.fetchFn);
    const res = await request(app)
      .put(BASE)
      .set(MEMBER)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
    expect(net.calls).toHaveLength(0);
    expect(await rig.stores.binding.get()).toBeNull();
  });

  it('MCP_BINDING_OPEN_TO_ALL lets a non-admin write the binding', async () => {
    const net = identityNetwork();
    const { app, rig } = makeIdentityApp(net.fetchFn, {
      MCP_BINDING_OPEN_TO_ALL: 'true',
    });
    const res = await request(app)
      .put(BASE)
      .set(MEMBER)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(200);
    expect(await rig.stores.binding.get()).not.toBeNull();
  });

  it('forged e-mail and id fields do not make a non-admin an admin', async () => {
    const net = identityNetwork();
    const { app, rig } = makeIdentityApp(net.fetchFn);
    const res = await request(app)
      .put(`${BASE}?userEmail=boss@example.com&userId=admin-1`)
      .set(MEMBER)
      .set('x-admin-email', 'boss@example.com')
      .send({
        serverKey: SERVER_KEY,
        userLabel: 'boss@example.com',
        userId: 'admin-1',
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
    expect(await rig.stores.binding.get()).toBeNull();
  });

  it('first bind by an admin needs no MCP token and stores a public binding', async () => {
    const net = identityNetwork();
    const { app, rig } = makeIdentityApp(net.fetchFn);
    const before = Date.now();
    const res = await request(app)
      .put(BASE)
      .set(ADMIN)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe(MCP_URL);
    expect(res.body.data.authenticationMode).toBe('CommercetoolsIdentity');
    expect(res.body.data.connectedAt).toBeGreaterThanOrEqual(before);
    expect(JSON.stringify(res.body)).not.toContain('client');

    const stored = await rig.stores.binding.get();
    expect(stored?.serverKey).toBe(SERVER_KEY);
    expect(stored?.discovery?.authorizationServers).toEqual([AS_ORIGIN]);
  });

  it('a url different from the derived one -> 400 and nothing stored', async () => {
    const net = identityNetwork();
    const { app, rig } = makeIdentityApp(net.fetchFn);
    const res = await request(app).put(BASE).set(ADMIN).send({
      serverKey: SERVER_KEY,
      url: 'https://mcp.example.com/projects/p/x',
    });
    expect(res.status).toBe(400);
    expect(await rig.stores.binding.get()).toBeNull();
    expect(net.calls).toHaveLength(0);
  });

  it.each(['https://evil/x', 'a', '', 'has space'])(
    'serverKey %j -> 400',
    async (serverKey) => {
      const { app, rig } = makeIdentityApp(identityNetwork().fetchFn);
      const res = await request(app).put(BASE).set(ADMIN).send({ serverKey });
      expect(res.status).toBe(400);
      expect(await rig.stores.binding.get()).toBeNull();
    }
  );

  it('a ClientCredentials server -> 400 naming the verdict, binding unchanged', async () => {
    const { app, rig } = makeIdentityApp(clientCredentialsNetwork().fetchFn);
    await rig.stores.binding.set(bindingFixture());
    const res = await request(app)
      .put(BASE)
      .set(ADMIN)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('client-credentials-as');
    expect((await rig.stores.binding.get())?.serverKey).toBe(SERVER_KEY);
  });

  it('rebinding changes connectedAt, drops the client, clears tool-set caches, and makes users not connected', async () => {
    const { app, rig } = makeIdentityApp(identityNetwork().fetchFn);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-1' }));
    await getCache().set(
      CACHE_NS.MCP_IDENTITY_TOOLS,
      'ctmcpid:member-1:1:x',
      { stale: true },
      60_000
    );
    expect(
      (await request(app).get(`${BASE}/status`).set(MEMBER)).body.data.connected
    ).toBe(true);

    const res = await request(app)
      .put(BASE)
      .set(ADMIN)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(200);
    expect(res.body.data.connectedAt).not.toBe(CONNECTED_AT);
    expect((await rig.stores.binding.get())?.client).toBeUndefined();
    expect(
      await getCache().get(CACHE_NS.MCP_IDENTITY_TOOLS, 'ctmcpid:member-1:1:x')
    ).toBeNull();
    expect(
      (await request(app).get(`${BASE}/status`).set(MEMBER)).body.data.connected
    ).toBe(false);
  });
});

describe('PUT /managed-mcp-identity: rebind cleanup (TA-21)', () => {
  it("removes the old binding's token records of every user, revoking them best effort", async () => {
    const fake = fakeAuth2();
    const net = routedFetch(fakeMcp().responder, auth2Responder(fake));
    const { app, rig } = makeIdentityApp(net.fetchFn);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    for (const id of ['u1', 'u2'])
      await rig.stores.tokens.put(tokenRecordFixture({ userId: id }));

    const res = await request(app)
      .put(BASE)
      .set(ADMIN)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(200);
    for (const id of ['u1', 'u2'])
      expect(await rig.stores.tokens.get(id)).toBeNull();
    expect(fake.revocations).toHaveLength(2);
  });

  it('an unreachable revocation endpoint does not block the rebind', async () => {
    const real = routedFetch(fakeMcp().responder, auth2Responder(fakeAuth2()));
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('revoke')) throw new Error('offline');
      return real.fetchFn(input, init);
    }) as typeof fetch;
    const { app, rig } = makeIdentityApp(flaky);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'u1' }));
    const res = await request(app)
      .put(BASE)
      .set(ADMIN)
      .send({ serverKey: SERVER_KEY });
    expect(res.status).toBe(200);
    expect(await rig.stores.tokens.get('u1')).toBeNull();
  });
});

describe('DELETE /managed-mcp-identity', () => {
  it('a non-admin gets 403 and nothing is deleted', async () => {
    const { app, rig } = makeIdentityApp(identityNetwork().fetchFn);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-1' }));
    const res = await request(app).delete(BASE).set(MEMBER);
    expect(res.status).toBe(403);
    expect(await rig.stores.tokens.get('member-1')).not.toBeNull();
    expect(await rig.stores.binding.get()).not.toBeNull();
  });

  it('MCP_BINDING_OPEN_TO_ALL lets a non-admin delete the binding', async () => {
    const { app, rig } = makeIdentityApp(identityNetwork().fetchFn, {
      MCP_BINDING_OPEN_TO_ALL: 'true',
    });
    await rig.stores.binding.set(bindingFixture());
    const res = await request(app).delete(BASE).set(MEMBER);
    expect(res.status).toBe(200);
    expect(await rig.stores.binding.get()).toBeNull();
  });

  it("removes the binding and every other user's token records, and revokes best effort", async () => {
    const fake = fakeAuth2();
    const net = routedFetch(auth2Responder(fake));
    const { app, rig } = makeIdentityApp(net.fetchFn);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    for (const id of ['u1', 'u2', 'u3'])
      await rig.stores.tokens.put(tokenRecordFixture({ userId: id }));

    const res = await request(app).delete(BASE).set(ADMIN);
    expect(res.status).toBe(200);
    expect(await rig.stores.binding.get()).toBeNull();
    for (const id of ['u1', 'u2', 'u3'])
      expect(await rig.stores.tokens.get(id)).toBeNull();
    expect(fake.revocations).toHaveLength(3);
  });

  it('an unreachable revocation endpoint still deletes locally and answers 200', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const { app, rig } = makeIdentityApp(failing);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'u1' }));
    const res = await request(app).delete(BASE).set(ADMIN);
    expect(res.status).toBe(200);
    expect(await rig.stores.tokens.get('u1')).toBeNull();
    expect(await rig.stores.binding.get()).toBeNull();
  });
});

describe('GET /status, DELETE /me, bootstrap fields', () => {
  it('not configured, then connected, then a stale revision is not connected', async () => {
    const { app, rig } = makeIdentityApp(identityNetwork().fetchFn);
    expect(
      (await request(app).get(`${BASE}/status`).set(MEMBER)).body.data
    ).toEqual({
      configured: false,
      connected: false,
    });

    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-1' }));
    const connected = (await request(app).get(`${BASE}/status`).set(MEMBER))
      .body.data;
    expect(connected).toMatchObject({
      configured: true,
      connected: true,
      serverKey: SERVER_KEY,
      hasRefreshToken: true,
    });
    expect(JSON.stringify(connected)).not.toContain('refresh-1');

    await rig.stores.tokens.put(
      tokenRecordFixture({
        userId: 'member-1',
        bindingConnectedAt: CONNECTED_AT - 1,
        issuedAt: 9_999_999_999_999,
      })
    );
    expect(
      (await request(app).get(`${BASE}/status`).set(MEMBER)).body.data.connected
    ).toBe(false);
  });

  it('the bootstrap contributor reports configured/connected with the legacy alias', async () => {
    const { rig } = makeIdentityApp(identityNetwork().fetchFn);
    const asRequest = {
      user: { userId: 'member-1', projectKey: 'p', isAdmin: false },
    } as AuthenticatedRequest;
    expect(await runContributors(asRequest)).toMatchObject({
      identityMcpConfigured: false,
      identityUserConnected: false,
      managedMcpConfigured: false,
    });
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-1' }));
    expect(await runContributors(asRequest)).toMatchObject({
      identityMcpConfigured: true,
      identityUserConnected: true,
      managedMcpConfigured: true,
    });
  });

  it('the bootstrap contributor reports canManageMcpBinding: admin, or anyone under the flag', async () => {
    const member = {
      user: { userId: 'member-1', projectKey: 'p', isAdmin: false },
    } as AuthenticatedRequest;
    const admin = {
      user: { userId: 'admin-1', projectKey: 'p', isAdmin: true },
    } as AuthenticatedRequest;

    makeIdentityApp(identityNetwork().fetchFn);
    expect(await runContributors(member)).toMatchObject({
      canManageMcpBinding: false,
    });
    expect(await runContributors(admin)).toMatchObject({
      canManageMcpBinding: true,
    });

    makeIdentityApp(identityNetwork().fetchFn, {
      MCP_BINDING_OPEN_TO_ALL: 'true',
    });
    expect(await runContributors(member)).toMatchObject({
      canManageMcpBinding: true,
    });
  });

  it('DELETE /me removes only the caller, revokes, and reports connected:false', async () => {
    const fake = fakeAuth2();
    const { app, rig } = makeIdentityApp(
      routedFetch(auth2Responder(fake)).fetchFn
    );
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-1' }));
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-2' }));

    const res = await request(app).delete(`${BASE}/me`).set(MEMBER);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ connected: false });
    expect(await rig.stores.tokens.get('member-1')).toBeNull();
    expect(await rig.stores.tokens.get('member-2')).not.toBeNull();
    expect(fake.revocations).toHaveLength(1);
    expect(
      (await request(app).get(`${BASE}/status`).set(MEMBER)).body.data.connected
    ).toBe(false);
  });
});

describe('POST /verify', () => {
  it('409 without a binding; 401 IDENTITY_REAUTH_REQUIRED without a token', async () => {
    const net = routedFetch(fakeMcp().responder, auth2Responder(fakeAuth2()));
    const { app, rig } = makeIdentityApp(net.fetchFn);
    expect((await request(app).post(`${BASE}/verify`).set(MEMBER)).status).toBe(
      409
    );

    await rig.stores.binding.set(bindingFixture());
    const res = await request(app).post(`${BASE}/verify`).set(MEMBER);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('IDENTITY_REAUTH_REQUIRED');
  });

  it('lists the tools of a connected user; 403 IDENTITY_NO_PERMITTED_TOOLS when none is permitted', async () => {
    const mcp = fakeMcp({ tools: ['read_orders'] });
    const { app, rig } = makeIdentityApp(routedFetch(mcp.responder).fetchFn);
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.tokens.put(tokenRecordFixture({ userId: 'member-1' }));
    const res = await request(app).post(`${BASE}/verify`).set(MEMBER);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      connected: true,
      toolCount: 1,
      toolNames: ['read_orders'],
    });

    const denied = fakeMcp({
      toolsListResponse: () =>
        new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    });
    await getCache().clearNamespace(CACHE_NS.MCP_IDENTITY_TOOLS);
    const second = makeIdentityApp(routedFetch(denied.responder).fetchFn);
    await second.rig.stores.binding.set(bindingFixture());
    await second.rig.stores.tokens.put(
      tokenRecordFixture({ userId: 'member-1' })
    );
    const res403 = await request(second.app).post(`${BASE}/verify`).set(MEMBER);
    expect(res403.status).toBe(403);
    expect(res403.body.code).toBe('IDENTITY_NO_PERMITTED_TOOLS');
  });
});
