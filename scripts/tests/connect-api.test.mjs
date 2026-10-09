/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DeploymentFailed, Timeout, getDeployment, getToken, tokenSource, waitForDeployed } from '../connect/lib/api.mjs';
import { smoke } from '../connect/lib/smoke.mjs';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('api: token request shape', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return json(200, { access_token: 'tok', expires_in: 3600 });
  };
  const { token } = await getToken({ fetch, region: 'us-central1.gcp', projectKey: 'p1', clientId: 'cid', clientSecret: 'sec' });
  assert.equal(token, 'tok');
  assert.equal(calls[0].url, 'https://auth.us-central1.gcp.commercetools.com/oauth/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from('cid:sec').toString('base64')}`);
  assert.equal(calls[0].init.body, 'grant_type=client_credentials&scope=view_connectors_deployments%3Ap1');
});

test('api: token errors carry the status and message only', async () => {
  const fetch = async () => json(401, { message: 'invalid client' });
  await assert.rejects(
    () => getToken({ fetch, region: 'r', projectKey: 'p', clientId: 'cid', clientSecret: 'sec-value' }),
    (e) => /HTTP 401: invalid client/.test(e.message) && !e.message.includes('sec-value')
  );
});

test('api: token is cached for its lifetime', async () => {
  let n = 0;
  const fetch = async () => json(200, { access_token: `t${++n}`, expires_in: 3600 });
  let t = 0;
  const get = tokenSource({ fetch, region: 'r', projectKey: 'p', clientId: 'a', clientSecret: 'b' }, () => t);
  assert.equal(await get(), 't1');
  assert.equal(await get(), 't1');
  t = 4_000_000;
  assert.equal(await get(), 't2');
});

test('api: getDeployment url', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return json(200, { status: 'Deployed' });
  };
  const d = await getDeployment({ fetch, region: 'us-central1.gcp', projectKey: 'p1', key: 'a b/c', getTokenValue: async () => 'tok' });
  assert.equal(d.status, 'Deployed');
  assert.equal(calls[0].url, 'https://connect.us-central1.gcp.commercetools.com/p1/deployments/key=a%20b%2Fc');
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok');
});

test('wait: resolves on Deployed', async () => {
  const { now, sleep } = clock();
  const states = ['Queued', 'Queued', 'Deployed'];
  const d = await waitForDeployed({ getDeployment: async () => ({ status: states.shift() }), sleep, now });
  assert.equal(d.status, 'Deployed');
});

test('wait: throws on Failed', async () => {
  const { now, sleep } = clock();
  await assert.rejects(() => waitForDeployed({ getDeployment: async () => ({ status: 'Failed' }), sleep, now }), DeploymentFailed);
});

test('wait: times out', async () => {
  const { now, sleep } = clock();
  await assert.rejects(
    () => waitForDeployed({ getDeployment: async () => ({ status: 'Queued' }), sleep, now, timeoutMs: 60_000, intervalMs: 20_000 }),
    Timeout
  );
});

test('wait: after a redeploy it ignores the stale Deployed status until the version changes', async () => {
  const { now, sleep } = clock();
  const seq = [
    { status: 'Deployed', version: 1 },
    { status: 'Deployed', version: 1 },
    { status: 'Deployed', version: 2 },
  ];
  let calls = 0;
  const d = await waitForDeployed({
    getDeployment: async () => seq[Math.min(calls++, seq.length - 1)],
    sleep,
    now,
    since: { version: 1 },
  });
  assert.equal(d.version, 2);
  assert.equal(calls, 3);
});

test('wait: after a redeploy it also accepts a status that left Deployed', async () => {
  const { now, sleep } = clock();
  const seq = [{ status: 'Queued', version: 1 }, { status: 'Deployed', version: 1 }];
  let calls = 0;
  const d = await waitForDeployed({ getDeployment: async () => seq[Math.min(calls++, 1)], sleep, now, since: { version: 1 } });
  assert.equal(d.status, 'Deployed');
});

test('wait: proceeds with a warning when nothing changes within the grace period', async () => {
  const { now, sleep } = clock();
  const warnings = [];
  const d = await waitForDeployed({
    getDeployment: async () => ({ status: 'Deployed', version: 1 }),
    sleep,
    now,
    since: { version: 1 },
    graceMs: 40_000,
    intervalMs: 20_000,
    onWarning: (m) => warnings.push(m),
  });
  assert.equal(d.version, 1);
  assert.equal(warnings.length, 1);
});

test('wait: ready predicate gates the result (service url known)', async () => {
  const { now, sleep } = clock();
  const seq = [{ status: 'Deployed' }, { status: 'Deployed', applications: [{ applicationName: 'service', url: 'https://s.example' }] }];
  let calls = 0;
  const d = await waitForDeployed({
    getDeployment: async () => seq[Math.min(calls++, 1)],
    sleep,
    now,
    ready: (x) => (x.applications ?? []).length > 0,
  });
  assert.equal(calls, 2);
  assert.ok(d.applications);
});

test('smoke: retries on 503 then ok', async () => {
  const { sleep } = clock();
  const statuses = [503, 502, 200];
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    const s = statuses.shift();
    return { status: s, json: async () => ({ status: 'UP' }) };
  };
  const result = await smoke({ fetch, sleep, origin: 'https://s.example', attempts: 5, delayMs: 1 });
  assert.equal(result.attempts, 3);
  assert.equal(urls[0], 'https://s.example/service/status');
});

test('smoke: retries on network errors', async () => {
  const { sleep } = clock();
  let n = 0;
  const fetch = async () => {
    if (n++ === 0) throw new TypeError('fetch failed');
    return { status: 200, json: async () => ({ status: 'ok' }) };
  };
  assert.equal((await smoke({ fetch, sleep, origin: 'https://s.example', delayMs: 1 })).attempts, 2);
});

test('smoke: fails after attempts', async () => {
  const { sleep } = clock();
  const fetch = async () => ({ status: 503, json: async () => ({}) });
  await assert.rejects(() => smoke({ fetch, sleep, origin: 'https://s.example', attempts: 3, delayMs: 1 }), /after 3 attempts: HTTP 503/);
});

test('smoke: 401, 403 and 404 are not retried', async () => {
  const { sleep } = clock();
  for (const status of [401, 403, 404]) {
    let n = 0;
    const fetch = async () => {
      n += 1;
      return { status, json: async () => ({}) };
    };
    await assert.rejects(() => smoke({ fetch, sleep, origin: 'https://s.example', attempts: 5, delayMs: 1 }), new RegExp(`HTTP ${status}`));
    assert.equal(n, 1);
  }
});
