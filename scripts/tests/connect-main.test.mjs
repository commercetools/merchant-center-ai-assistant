/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audienceOf, main } from '../connect/connect.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONNECT = join(HERE, '..', 'connect', 'connect.mjs');

const ENV = {
  CONNECT_REGION: 'us-central1.gcp',
  CTP_PROJECT_KEY: 'proj1',
  CONNECT_CLIENT_ID: 'cid',
  CONNECT_CLIENT_SECRET: 'client-secret-value',
  CONNECTOR_KEY: 'ck',
  CONNECTOR_NAME: 'AI Assistant',
  CREATOR_EMAIL: 'dev@example.com',
  REPO_URL: 'https://git.example/r.git',
  REPO_TAG: 'v0.1.0',
  DEPLOYMENT_KEY: 'dk',
  GCP_SA_KEY_BASE64: 'c2VjcmV0LXNhLXZhbHVl',
  ENCRYPTION_KEY: 'c2VjcmV0LWVuYy12YWx1ZQ==',
  MC_APP_CUSTOM_APPLICATION_ID: 'app-1',
  COMPOSED_APPS_CUSTOM_APPLICATION_ID: 'app-2',
  MC_VIEW_CUSTOM_VIEW_ID: 'view-1',
};

const SERVICE_URL = 'https://service-abc.us-central1.gcp.commercetools.app/service';
const ORIGIN = 'https://service-abc.us-central1.gcp.commercetools.app';

/** Runs main() with fakes. `cliHandler(args, opts)` answers CLI calls (capture or not). */
async function run(argv, { env = ENV, cliHandler = () => '', fetchHandler, timing } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const exec = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return cliHandler(args, opts);
  };
  const fetch = async (url, init) => {
    if (!fetchHandler) throw new Error(`unexpected fetch ${url}`);
    return fetchHandler(String(url), init);
  };
  let t = 0;
  const code = await main(argv, env, {
    exec,
    fetch,
    sleep: async (ms) => {
      t += ms;
    },
    now: () => t,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    envFile: null,
    timing: { intervalMs: 1000, smokeAttempts: 3, smokeDelayMs: 1, timeoutMs: 60_000, graceMs: 5000, ...timing },
  });
  return { code, calls, out, err, text: [...out, ...err].join('\n') };
}

const subcommand = (c) => c.args.slice(1, 3).join(' ');
const jsonResponse = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

/** Fake Connect API: token + deployment states served in order (last one repeats). */
function fakeApi(deployments, { status = 200 } = {}) {
  let i = 0;
  const gets = [];
  return {
    gets,
    handler: async (url) => {
      if (url.includes('/oauth/token')) return jsonResponse({ access_token: 'tok', expires_in: 3600 });
      if (url.endsWith('/service/status')) return jsonResponse({ status: 'UP' }, status);
      gets.push(url);
      return jsonResponse(deployments[Math.min(i++, deployments.length - 1)]);
    },
  };
}

const app = (name, url) => ({ applicationName: name, url });
const apps = [app('service', SERVICE_URL), app('mc-app', 'https://mc.example'), app('composed-apps', 'https://pages.example'), app('mc-view-app', 'https://view.example')];

test('stage: create vs update decision', async () => {
  const notFound = (_args, opts) => {
    if (!opts.encoding) return '';
    throw Object.assign(new Error('x'), { status: 1, stderr: 'Connector staged not found' });
  };
  const create = await run(['stage'], { cliHandler: notFound });
  assert.equal(create.code, 0);
  assert.deepEqual(create.calls.map(subcommand), ['connectorstaged describe', 'connectorstaged create']);

  const update = await run(['stage', '--tag', 'v0.2.0'], { cliHandler: () => 'key: ck' });
  assert.equal(update.code, 0);
  assert.deepEqual(update.calls.map(subcommand), ['connectorstaged describe', 'connectorstaged update']);
  assert.ok(update.calls[1].args.includes('v0.2.0'));

  const authError = await run(['stage'], {
    cliHandler: () => {
      throw Object.assign(new Error('x'), { status: 1, stderr: 'Unauthorized' });
    },
  });
  assert.equal(authError.code, 1);
  assert.equal(authError.calls.length, 1, 'no create after an unrelated describe failure');
});

test('stage: dry run prints one command and runs nothing', async () => {
  const r = await run(['stage', '--dry-run']);
  assert.equal(r.code, 0);
  assert.equal(r.calls.length, 0);
  assert.equal(r.out.filter((l) => l.startsWith('$ commercetools connect connectorstaged')).length, 1);
});

test('stage: AWS region omits --supported-regions with a warning', async () => {
  const r = await run(['stage', '--dry-run'], { env: { ...ENV, CONNECT_REGION: 'eu-central-1.aws' } });
  assert.ok(!r.out.join('\n').includes('--supported-regions'));
  assert.ok(r.err.some((l) => l.includes('warning')));
});

test('publish: runs connectorstaged publish', async () => {
  const r = await run(['publish']);
  assert.deepEqual(r.calls.map(subcommand), ['connectorstaged publish']);
});

test('preview: uses the preview deployment key and the phase 1 configuration', async () => {
  const r = await run(['preview']);
  assert.deepEqual(r.calls.map(subcommand), ['connectorstaged preview']);
  assert.ok(r.calls[0].args.includes('dk-preview'));
  assert.ok(r.calls[0].args.includes('mc-app.CUSTOM_APPLICATION_ID=app-1'));
  assert.ok(!r.text.includes(ENV.GCP_SA_KEY_BASE64));
});

test('deploy: production guard', async () => {
  const r = await run(['deploy', '--type', 'production', '--dry-run']);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.err.join('\n'), /--confirm-production/);
  const ok = await run(['deploy', '--type', 'production', '--confirm-production', '--dry-run']);
  assert.equal(ok.code, 0);
  assert.ok(ok.out.join('\n').includes('--type production'));
});

test('deploy: preview type is refused', async () => {
  const r = await run(['deploy', '--type', 'preview']);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
});

test('deploy: a missing variable exits 2 naming it and runs nothing', async () => {
  const { GCP_SA_KEY_BASE64: _removed, ...env } = ENV;
  const r = await run(['deploy'], { env });
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.err.join('\n'), /GCP_SA_KEY_BASE64/);
});

test('deploy: refuses to create when the deployment already exists', async () => {
  const r = await run(['deploy'], { cliHandler: () => 'status: Deployed' });
  assert.equal(r.code, 1);
  assert.deepEqual(r.calls.map(subcommand), ['deployment describe']);
  assert.match(r.err.join('\n'), /already exists/);
});

test('deploy: creates with masked output and the real values on the argv', async () => {
  const r = await run(['deploy'], {
    env: { ...ENV, STRIPE_SECRET_KEY: 'sk_test_SENTINEL', ADMIN_USER_IDS: 'id-a,id-b' },
    cliHandler: (args, opts) => {
      if (opts.encoding) throw Object.assign(new Error('x'), { status: 1, stderr: 'not found' });
      return '';
    },
  });
  assert.equal(r.code, 0);
  const create = r.calls.find((c) => subcommand(c) === 'deployment create');
  assert.ok(create.args.includes(`service.GCP_SA_KEY_BASE64=${ENV.GCP_SA_KEY_BASE64}`), 'the CLI receives the real value');
  assert.ok(!r.text.includes(ENV.GCP_SA_KEY_BASE64));
  assert.ok(!r.text.includes('SENTINEL'));
  assert.ok(r.text.includes('service.STRIPE_SECRET_KEY=***'));
  assert.ok(r.text.includes('service.ADMIN_USER_IDS=id-a,id-b'));
  assert.ok(r.text.includes('next: node scripts/connect/connect.mjs finalize'));
});

test('finalize: sequence and values', async () => {
  const before = { status: 'Deployed', version: 1, applications: apps };
  const after = {
    status: 'Deployed',
    version: 2,
    applications: [{ ...apps[0], standardConfiguration: [{ key: 'MC_AUDIENCE', value: ORIGIN }] }, ...apps.slice(1)],
  };
  const api = fakeApi([before, before, after]);
  const r = await run(['finalize'], {
    fetchHandler: api.handler,
    cliHandler: (args, opts) => (opts.encoding ? 'post-deploy: OK\npost-deploy: providers stripe: not configured (missing: STRIPE_SECRET_KEY)\n' : ''),
  });
  assert.equal(r.code, 0, r.text);
  const redeploy = r.calls.find((c) => subcommand(c) === 'deployment redeploy');
  const configuration = redeploy.args.filter((_, i) => redeploy.args[i - 1] === '--configuration');
  assert.deepEqual(configuration, [
    `service.MC_AUDIENCE=${ORIGIN}`,
    `mc-app.CHAT_SERVICE_ENDPOINT_URL=${SERVICE_URL}`,
    `composed-apps.CHAT_SERVICE_ENDPOINT_URL=${SERVICE_URL}`,
    `mc-view-app.CHAT_SERVICE_ENDPOINT_URL=${SERVICE_URL}`,
  ]);
  assert.ok(!redeploy.args.includes('--updateConnector'));
  assert.deepEqual(r.calls.map(subcommand), ['deployment redeploy', 'deployment logs']);
  assert.ok(r.out.includes('[MANUAL M9] paste these URLs into the Merchant Center registrations'));
  assert.ok(r.text.includes('https://pages.example'));
  assert.ok(r.text.includes('smoke: ok'));
});

test('finalize: stops when postDeploy failed', async () => {
  const d = { status: 'Deployed', version: 1, applications: apps };
  const api = fakeApi([d, { ...d, version: 2 }]);
  const r = await run(['finalize'], {
    fetchHandler: api.handler,
    cliHandler: (args, opts) => (opts.encoding ? 'post-deploy: FAILED vertex\n' : ''),
  });
  assert.equal(r.code, 1);
  assert.match(r.err.join('\n'), /post-deploy: FAILED vertex/);
  assert.ok(!r.text.includes('smoke:'), 'no smoke check after a failed postDeploy');
});

test('finalize: an audience that differs from the origin fails', async () => {
  const d = { status: 'Deployed', version: 1, applications: apps };
  const wrong = { status: 'Deployed', version: 2, applications: [{ ...apps[0], standardConfiguration: { MC_AUDIENCE: 'https://other.example' } }, ...apps.slice(1)] };
  const r = await run(['finalize'], { fetchHandler: fakeApi([d, wrong]).handler, cliHandler: () => '' });
  assert.equal(r.code, 1);
  assert.match(r.err.join('\n'), /other\.example/);
});

test('finalize: keeps polling while the service url is empty, then exits 1 with the logs hint', async () => {
  const queued = { status: 'Queued', applications: [app('service', '')] };
  const r = await run(['finalize'], { fetchHandler: fakeApi([queued]).handler, timing: { timeoutMs: 5000 } });
  assert.equal(r.code, 1);
  assert.equal(r.calls.length, 0, 'no redeploy before the url is known');
  assert.match(r.err.join('\n'), /logs --application service/);
});

test('finalize: a Failed deployment exits 1', async () => {
  const r = await run(['finalize'], { fetchHandler: fakeApi([{ status: 'Failed' }]).handler });
  assert.equal(r.code, 1);
  assert.equal(r.calls.length, 0);
});

test('finalize: dry run prints the redeploy with a placeholder and runs nothing', async () => {
  const r = await run(['finalize', '--dry-run']);
  assert.equal(r.code, 0);
  assert.equal(r.calls.length, 0);
  assert.ok(r.out[0].includes('service.MC_AUDIENCE=https://<service-origin>'));
});

test('configure: partial merge args', async () => {
  const dry = await run(['configure', 'STRIPE_SECRET_KEY=sk_test_SENTINEL', 'CONTENTSTACK_REGION=eu', '--dry-run']);
  assert.equal(dry.code, 0);
  assert.equal(dry.out.length, 1);
  assert.ok(dry.out[0].includes('service.STRIPE_SECRET_KEY=***'));
  assert.ok(dry.out[0].includes('service.CONTENTSTACK_REGION=eu'));
  assert.ok(!dry.out[0].includes('--updateConnector'));
  assert.ok(!dry.text.includes('SENTINEL'));

  const d = { status: 'Deployed', version: 1, applications: apps };
  const real = await run(['configure', 'STRIPE_SECRET_KEY=sk_test_SENTINEL'], {
    fetchHandler: fakeApi([d, { ...d, version: 2 }]).handler,
    cliHandler: (args, opts) => (opts.encoding ? 'post-deploy: providers stripe: configured\nother line\n' : ''),
  });
  assert.equal(real.code, 0, real.text);
  const redeploys = real.calls.filter((c) => subcommand(c) === 'deployment redeploy');
  assert.equal(redeploys.length, 1);
  assert.deepEqual(redeploys[0].args.filter((_, i) => redeploys[0].args[i - 1] === '--configuration'), ['service.STRIPE_SECRET_KEY=sk_test_SENTINEL']);
  assert.ok(real.out.includes('post-deploy: providers stripe: configured'));
  assert.ok(!real.out.includes('other line'));
  assert.ok(!real.text.includes('SENTINEL'));
});

test('configure: only allow-listed keys', async () => {
  const r = await run(['configure', 'STRIPE_SECRET_KEY=sk_test_x', 'GCP_SA_KEY_BASE64=y', '--dry-run']);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.err.join('\n'), /GCP_SA_KEY_BASE64 is not configurable/);
});

test('configure: accepts ADMIN_USER_IDS', async () => {
  const r = await run(['configure', 'ADMIN_USER_IDS=id-a', '--dry-run']);
  assert.equal(r.code, 0);
  assert.ok(r.out[0].includes('service.ADMIN_USER_IDS=id-a'));
});

test('update-code: command order', async () => {
  const r = await run(['update-code', '--tag', 'v0.2.0', '--dry-run']);
  assert.equal(r.code, 0);
  const lines = r.out.filter((l) => l.startsWith('$ '));
  assert.match(lines[0], /connectorstaged update .*--repository-tag v0\.2\.0/);
  assert.match(lines[1], /connectorstaged publish/);
  assert.match(lines[2], /deployment redeploy .*--updateConnector/);
});

test('update-code: runs the chain, waits and smoke checks', async () => {
  const d = { status: 'Deployed', version: 1, applications: apps };
  const r = await run(['update-code', '--tag', 'v0.2.0'], { fetchHandler: fakeApi([d, d, { ...d, version: 2 }]).handler });
  assert.equal(r.code, 0, r.text);
  assert.deepEqual(r.calls.map(subcommand), ['connectorstaged update', 'connectorstaged publish', 'deployment redeploy']);
  assert.ok(r.text.includes('version 1 -> 2'));
  assert.ok(r.text.includes('smoke: ok'));
});

test('update-code: needs --tag', async () => {
  assert.equal((await run(['update-code'])).code, 2);
});

test('delete: requires --yes', async () => {
  const no = await run(['delete']);
  assert.equal(no.code, 2);
  assert.equal(no.calls.length, 0);
  const yes = await run(['delete', '--yes']);
  assert.deepEqual(yes.calls.map(subcommand), ['deployment delete']);
  const preview = await run(['delete', '--preview', '--yes']);
  assert.ok(preview.calls[0].args.includes('dk-preview'));
});

test('status: prints status, version and application urls', async () => {
  const r = await run(['status'], { fetchHandler: fakeApi([{ status: 'Deployed', version: 3, applications: apps }]).handler });
  assert.equal(r.code, 0);
  assert.ok(r.text.includes('status Deployed, version 3'));
  assert.ok(r.text.includes('https://view.example'));
});

test('logs: wraps deployment logs with computed dates', async () => {
  const r = await run(['logs', '--application', 'service', '--since', '1h']);
  assert.equal(r.code, 0);
  assert.ok(r.calls[0].args.includes('--application'));
  assert.ok(r.calls[0].args.includes('--startDate'));
  assert.equal((await run(['logs', '--since', 'soon'])).code, 2);
});

test('main: help lists the ten commands, unknown command exits 2', async () => {
  const help = await run(['help']);
  for (const c of ['stage', 'publish', 'preview', 'deploy', 'finalize', 'configure', 'update-code', 'status', 'logs', 'delete']) {
    assert.ok(help.out.join('\n').includes(c), c);
  }
  const bogus = await run(['bogus']);
  assert.equal(bogus.code, 2);
  assert.equal((await run(['deploy', '--wat'])).code, 2);
});

test('main: a failing CLI call reports the status, never the command line', async () => {
  const r = await run(['publish'], {
    cliHandler: () => {
      throw Object.assign(new Error(`Command failed: commercetools ... ${ENV.GCP_SA_KEY_BASE64}`), { status: 7 });
    },
  });
  assert.equal(r.code, 1);
  assert.ok(r.text.includes('exited with status 7'));
  assert.ok(!r.text.includes(ENV.GCP_SA_KEY_BASE64));
});

test('audienceOf: tolerates the unverified configuration shapes', () => {
  assert.equal(audienceOf({ applications: [{ applicationName: 'service', standardConfiguration: [{ key: 'MC_AUDIENCE', value: 'x' }] }] }), 'x');
  assert.equal(audienceOf({ applications: [{ applicationName: 'service', standardConfiguration: { MC_AUDIENCE: 'y' } }] }), 'y');
  assert.equal(audienceOf({ applications: [] }), undefined);
});

// ---- the real command line, with a fake CLI executable ------------------------------------

function fakeCli() {
  const dir = mkdtempSync(join(tmpdir(), 'fake-cli-'));
  const bin = join(dir, 'fake-commercetools.mjs');
  const log = join(dir, 'calls.jsonl');
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env node',
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');",
      "if (process.argv.includes('describe')) { process.stderr.write('not found\\n'); process.exit(1); }",
      '',
    ].join('\n')
  );
  chmodSync(bin, 0o755);
  return { bin, log };
}

function spawnConnect(args, env) {
  return spawnSync(process.execPath, [CONNECT, ...args], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
}

test('process: deploy --dry-run never prints the secrets (spec scenario)', () => {
  const r = spawnConnect(['deploy', '--dry-run'], {
    ...ENV,
    GCP_SA_KEY_BASE64: 'abc',
    ENCRYPTION_KEY: 'def',
    STRIPE_SECRET_KEY: 'ghi',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('service.GCP_SA_KEY_BASE64=***'));
  assert.ok(r.stdout.includes('service.STRIPE_SECRET_KEY=***'));
  for (const secret of ['abc', 'def', 'ghi']) {
    assert.ok(!r.stdout.includes(secret), `stdout leaks ${secret}`);
    assert.ok(!r.stderr.includes(secret), `stderr leaks ${secret}`);
  }
});

test('process: a missing variable exits 2 and runs no CLI command', () => {
  const { bin, log } = fakeCli();
  const { GCP_SA_KEY_BASE64: _removed, ...env } = ENV;
  const r = spawnConnect(['deploy'], { ...env, CONNECT_CLI_BIN: bin, FAKE_CLI_LOG: log });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GCP_SA_KEY_BASE64/);
  assert.throws(() => readFileSync(log), 'the fake CLI was never called');
});

test('process: deploy executes the fake CLI with real values while the terminal stays masked', () => {
  const { bin, log } = fakeCli();
  const r = spawnConnect(['deploy'], { ...ENV, CONNECT_CLI_BIN: bin, FAKE_CLI_LOG: log });
  assert.equal(r.status, 0, r.stderr);
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls.map((c) => c.slice(1, 3).join(' ')), ['deployment describe', 'deployment create']);
  assert.ok(calls[1].includes(`service.GCP_SA_KEY_BASE64=${ENV.GCP_SA_KEY_BASE64}`));
  assert.ok(!r.stdout.includes(ENV.GCP_SA_KEY_BASE64));
  assert.ok(!r.stderr.includes(ENV.GCP_SA_KEY_BASE64));
});

test('process: help exits 0 and an unknown command exits 2', () => {
  assert.equal(spawnConnect(['help'], {}).status, 0);
  const bogus = spawnConnect(['bogus'], {});
  assert.equal(bogus.status, 2);
  assert.match(bogus.stderr, /Usage/);
});
