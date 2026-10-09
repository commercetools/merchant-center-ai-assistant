/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { CACHE_NS, getCache } from '../../src/cache';
import { captureLogs } from '../helpers/log-capture';
import { asUser, makeIdentityApp, resetIdentityApp } from './app';
import { auth2Responder, fakeMcp, routedFetch } from './fake-network';
import type { Responder } from './fake-network';
import {
  AS_ORIGIN,
  AUTH_STATE_CONTAINER,
  bindingFixture,
  CALLBACK,
  fakeAuth2,
  legacyClient,
  tokenRecordFixture,
  USER_ID,
  type FakeAuth2,
} from './helpers';

const BASE = '/service/managed-mcp-identity';
const ME = asUser(USER_ID);

afterEach(async () => {
  resetIdentityApp();
  await getCache().clearNamespace(CACHE_NS.MCP_IDENTITY_TOOLS);
});

const setup = (
  o: { extra?: Responder[]; env?: NodeJS.ProcessEnv; fake?: FakeAuth2 } = {}
) => {
  const fake = o.fake ?? fakeAuth2();
  const net = routedFetch(
    ...(o.extra ?? []),
    fakeMcp().responder,
    auth2Responder(fake)
  );
  const made = makeIdentityApp(net.fetchFn, o.env);
  return { ...made, fake, net };
};

const authorize = async (app: ReturnType<typeof setup>['app']) => {
  const res = await request(app).post(`${BASE}/authorize`).set(ME);
  const url = res.body?.data?.authorizationUrl
    ? new URL(res.body.data.authorizationUrl)
    : undefined;
  return { res, url, state: url?.searchParams.get('state') ?? '' };
};

const stateCount = async (rig: ReturnType<typeof setup>['rig']) =>
  (await rig.persistence.gateway.query(AUTH_STATE_CONTAINER, { limit: 50 }))
    .results.length;

describe('POST /authorize', () => {
  it('409 without a binding', async () => {
    const { app } = setup();
    expect((await request(app).post(`${BASE}/authorize`).set(ME)).status).toBe(
      409
    );
  });

  it('503 when MC_AUDIENCE is not configured', async () => {
    const { app, rig } = setup({ env: { MC_AUDIENCE: '' } });
    await rig.stores.binding.set(bindingFixture());
    const res = await request(app).post(`${BASE}/authorize`).set(ME);
    expect(res.status).toBe(503);
    expect(await stateCount(rig)).toBe(0);
  });

  it('503 and no stored attempt when the callback would be plain http', async () => {
    const { app, rig } = setup({
      env: { MC_AUDIENCE: 'http://localhost:3000' },
    });
    await rig.stores.binding.set(bindingFixture());
    const res = await request(app).post(`${BASE}/authorize`).set(ME);
    expect(res.status).toBe(503);
    expect(await stateCount(rig)).toBe(0);
  });

  it('returns a PKCE popup URL with the derived redirect and scope, one auth-state record, a registered client', async () => {
    const { app, rig, fake } = setup();
    await rig.stores.binding.set(bindingFixture());
    const { res, url } = await authorize(app);

    expect(res.status).toBe(200);
    expect(res.body.data.connected).toBe(false);
    expect(url?.origin).toBe(AS_ORIGIN);
    expect(url?.pathname).toBe('/oauth2/auth');
    expect(url?.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url?.searchParams.get('redirect_uri')).toBe(CALLBACK);
    expect(url?.searchParams.get('scope')).toContain(
      'mcp:p:ai-assistant-identity'
    );
    expect(url?.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await stateCount(rig)).toBe(1);
    expect(fake.registrations).toHaveLength(1);
    expect((await rig.stores.binding.get())?.client?.redirectUri).toBe(
      CALLBACK
    );
  });

  it('refreshes silently when the user already has a token (connected:true)', async () => {
    const { app, rig, fake } = setup();
    await rig.stores.binding.set(bindingFixture());
    await rig.stores.binding.setClient(legacyClient());
    await rig.stores.tokens.put(tokenRecordFixture());
    const res = await request(app).post(`${BASE}/authorize`).set(ME);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ connected: true });
    expect(fake.tokenRequests).toHaveLength(1);
    expect(await stateCount(rig)).toBe(0);
  });

  it('a client the AS forgot (invalid_client redirect) is cleared and registered again once', async () => {
    let preflights = 0;
    const forgetful: Responder = (url) => {
      if (url.origin === AS_ORIGIN && url.pathname === '/oauth2/auth') {
        preflights += 1;
        if (preflights === 1) {
          return new Response('', {
            status: 302,
            headers: {
              location: `${AS_ORIGIN}/oauth2/fallbacks/error?error=invalid_client`,
            },
          });
        }
        return new Response('login', { status: 200 });
      }
      return undefined;
    };
    const { app, rig, fake } = setup({ extra: [forgetful] });
    await rig.stores.binding.set(bindingFixture());
    const res = await request(app).post(`${BASE}/authorize`).set(ME);
    expect(res.status).toBe(200);
    expect(res.body.data.authorizationUrl).toContain(
      'client_id=registered-client-2'
    );
    expect(fake.registrations).toHaveLength(2);
    expect(await stateCount(rig)).toBe(1);
  });

  it('a second rejection returns 500 and stores no attempt', async () => {
    const alwaysRejected: Responder = (url) =>
      url.origin === AS_ORIGIN && url.pathname === '/oauth2/auth'
        ? new Response('', {
            status: 302,
            headers: {
              location: `${AS_ORIGIN}/oauth2/fallbacks/error?error=invalid_client`,
            },
          })
        : undefined;
    const { app, rig } = setup({ extra: [alwaysRejected] });
    await rig.stores.binding.set(bindingFixture());
    const res = await request(app).post(`${BASE}/authorize`).set(ME);
    expect(res.status).toBe(500);
    expect(await stateCount(rig)).toBe(0);
  });
});

describe('GET /callback', () => {
  const connect = async () => {
    const s = setup();
    await s.rig.stores.binding.set(bindingFixture());
    const { state } = await authorize(s.app);
    return { ...s, state };
  };

  it('completes the exchange, stores encrypted tokens, and replays are rejected without a second exchange', async () => {
    const { app, rig, fake, state } = await connect();
    const logs = captureLogs();

    const first = await request(app).get(
      `${BASE}/callback?code=the-auth-code&state=${state}&iss=${encodeURIComponent(AS_ORIGIN)}`
    );
    expect(first.status).toBe(200);
    expect(first.text).toContain('ct-identity-mcp-oauth');
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    const csp = String(first.headers['content-security-policy']);
    const nonce = /nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(first.text).toContain(`nonce="${nonce}"`);
    expect(csp).toContain("frame-ancestors 'none'");

    expect(fake.tokenRequests).toHaveLength(1);
    expect(fake.tokenRequests[0].get('code')).toBe('the-auth-code');
    expect(fake.tokenRequests[0].get('code_verifier')).toBeTruthy();
    expect(fake.tokenRequests[0].get('redirect_uri')).toBe(CALLBACK);

    const stored = await rig.stores.tokens.get(USER_ID);
    expect(stored?.record.hasRefreshToken).toBe(true);
    expect(stored?.record.scope).toContain('mcp:');
    expect(JSON.stringify(stored)).not.toContain('fresh-access');

    const replay = await request(app).get(
      `${BASE}/callback?code=the-auth-code&state=${state}`
    );
    expect(replay.status).toBe(400);
    expect(replay.text).toContain('invalid or was already used');
    expect(fake.tokenRequests).toHaveLength(1);

    const logged = logs.lines.join('');
    logs.stop();
    expect(logged).not.toContain('the-auth-code');
    expect(logged).not.toContain(state);
  });

  it('two concurrent callbacks with the same state exchange once', async () => {
    const { app, fake, state } = await connect();
    const [a, b] = await Promise.all([
      request(app).get(`${BASE}/callback?code=c1&state=${state}`),
      request(app).get(`${BASE}/callback?code=c1&state=${state}`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(fake.tokenRequests).toHaveLength(1);
  });

  it('missing state renders the failure page', async () => {
    const { app } = await connect();
    const res = await request(app).get(`${BASE}/callback`);
    expect(res.status).toBe(400);
    expect(res.text).toContain('Missing OAuth state');
  });

  it('access_denied: failure page, no tokens, state consumed, markup escaped', async () => {
    const { app, rig, fake, state } = await connect();
    const res = await request(app).get(
      `${BASE}/callback?error=access_denied&error_description=${encodeURIComponent('<script>x</script>')}&state=${state}`
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain('\\u003cscript>');
    expect(res.text).not.toContain('<script>x');
    expect(await rig.stores.tokens.get(USER_ID)).toBeNull();
    expect(fake.tokenRequests).toHaveLength(0);
    expect(await stateCount(rig)).toBe(0);
  });

  it('an expired attempt says so and is deleted', async () => {
    const { app, rig, state } = await connect();
    const page = (
      await rig.persistence.gateway.query(AUTH_STATE_CONTAINER, { limit: 5 })
    ).results[0];
    await rig.persistence.gateway.put(AUTH_STATE_CONTAINER, page.key, {
      ...(page.value as Record<string, unknown>),
      expiresAt: Date.now() - 1000,
    });
    const res = await request(app).get(
      `${BASE}/callback?code=c&state=${state}`
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain('expired');
    expect(await stateCount(rig)).toBe(0);
  });

  it('a rebind while the user was on the consent screen stores nothing', async () => {
    const { app, rig, fake, state } = await connect();
    await rig.stores.binding.set(
      bindingFixture({ connectedAt: 1_800_000_000_000 })
    );
    const res = await request(app).get(
      `${BASE}/callback?code=c&state=${state}`
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain('binding changed');
    expect(fake.tokenRequests).toHaveLength(0);
    expect(await rig.stores.tokens.get(USER_ID)).toBeNull();
  });

  it('a state the user never started (forged) is unknown', async () => {
    const { app, fake } = await connect();
    const res = await request(app).get(`${BASE}/callback?code=c&state=forged`);
    expect(res.status).toBe(400);
    expect(fake.tokenRequests).toHaveLength(0);
  });
});
