/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createVerify } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as cleanup, ledgerTargets } from '../e2e/cleanup.mjs';
import { run as co } from '../e2e/co.mjs';
import { addEntry, clearEntries, readEntries } from '../e2e/ledger.mjs';
import { makeBadJwt } from '../e2e/make-bad-jwt.mjs';
import { buildReport, statusKind } from '../e2e/report.mjs';
import { loadFixtures, run as seed, toStoredValue } from '../e2e/seed.mjs';
import { createRouter, parsePins } from '../e2e/two-instance.mjs';
import { countNeedles, isE2eObject, isOlderThan, isProtectedContainer, shapeOf } from '../e2e/lib/e2e-objects.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'e2e-helpers-'));

// ---- ledger ----------------------------------------------------------------------------------
test('ledger adds, reads and clears entries and rejects unsafe input', () => {
  const root = tmp();
  addEntry('run-1', { kind: 'session', id: 'abc-123' }, root);
  addEntry('run-1', { kind: 'object', id: 'e2e-x', container: 'shared-composed-pages' }, root);
  assert.deepEqual(readEntries('run-1', root).map((e) => [e.kind, e.id]), [['session', 'abc-123'], ['object', 'e2e-x']]);
  assert.throws(() => addEntry('run-1', { kind: 'secret', id: 'a' }, root), /kind must be/);
  assert.throws(() => addEntry('run-1', { kind: 'session', id: '../etc' }, root), /unsafe/);
  assert.throws(() => addEntry('../run', { kind: 'session', id: 'a' }, root), /unsafe/);
  clearEntries('run-1', root);
  assert.deepEqual(readEntries('run-1', root), []);
});

// ---- cleanup guard and idempotence ---------------------------------------------------------
test('isE2eObject only matches the marker and never protected containers', () => {
  assert.equal(isE2eObject('shared-composed-pages', 'e2e-orders', {}), true);
  assert.equal(isE2eObject('shared-composed-pages', 'my-page', {}), false);
  assert.equal(isE2eObject('ai-assistant-sessions', 'uuid', { title: 'e2e-title: hi' }), true);
  assert.equal(isE2eObject('ai-assistant-sessions', 'uuid', { title: 'real chat' }), false);
  assert.equal(isE2eObject('ai-assistant-feedback', 'f1', { comment: 'e2e-feedback' }), true);
  assert.equal(isE2eObject('ai-assistant-settings', 'e2e-settings', {}), false);
  assert.equal(isE2eObject('ai-assistant-identity-tokens', 'e2e-user', {}), false);
  assert.equal(isE2eObject('somebody-elses-container', 'e2e-a', {}), false);
  assert.equal(isProtectedContainer('ai-assistant-identity-auth-states'), true);
  assert.equal(isProtectedContainer('ai-assistant-sessions'), false);
});

test('isOlderThan uses lastModifiedAt', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  assert.equal(isOlderThan({ lastModifiedAt: '2026-10-07T12:00:00Z' }, 24, now), true);
  assert.equal(isOlderThan({ lastModifiedAt: '2026-10-09T11:00:00Z' }, 24, now), false);
  assert.equal(isOlderThan({}, 24, now), false);
});

function fakeApi(objects) {
  const store = new Map(objects.map((o) => [`${o.container}/${o.key}`, o]));
  const removed = [];
  return {
    removed,
    store,
    async *all(where = '') {
      const m = where.match(/container="([^"]+)"/);
      for (const o of [...store.values()]) if (!m || o.container === m[1]) yield o;
    },
    async remove(container, key) {
      const k = `${container}/${key}`;
      if (!store.has(k)) return null;
      store.delete(k);
      removed.push(k);
      return {};
    },
  };
}

const old = '2020-01-01T00:00:00Z';

test('cleanup --run deletes ledger entries twice-safely', async () => {
  const root = tmp();
  process.env.E2E_EVIDENCE_ROOT = root;
  try {
    addEntry('r1', { kind: 'session', id: 'sess-1' }, root);
    addEntry('r1', { kind: 'page', id: 'e2e-orders' }, root);
    addEntry('r1', { kind: 'object', id: 'tok', container: 'ai-assistant-identity-tokens' }, root);
    const api = fakeApi([
      { container: 'ai-assistant-sessions', key: 'sess-1', value: { title: 'x' } },
      { container: 'ai-assistant-messages-sess-1', key: 'm1', value: {} },
      { container: 'shared-composed-pages', key: 'e2e-orders', value: {} },
      { container: 'ai-assistant-identity-tokens', key: 'tok', value: {} },
      { container: 'shared-composed-pages', key: 'real-page', value: {} },
    ]);
    const lines = [];
    assert.equal(await cleanup(['--run', 'r1'], { client: api, log: (l) => lines.push(l) }), 0);
    assert.deepEqual(api.removed.sort(), ['ai-assistant-messages-sess-1/m1', 'ai-assistant-sessions/sess-1', 'shared-composed-pages/e2e-orders']);
    assert.ok(api.store.has('ai-assistant-identity-tokens/tok'), 'protected container is untouched');
    assert.ok(api.store.has('shared-composed-pages/real-page'));
    assert.match(lines.join('\n'), /deleted: 3/);
    const second = [];
    await cleanup(['--run', 'r1'], { client: api, log: (l) => second.push(l) });
    assert.match(second.join('\n'), /deleted: 0/);
  } finally {
    delete process.env.E2E_EVIDENCE_ROOT;
  }
});

test('cleanup --sweep removes only old marked objects and honours --dry-run', async () => {
  const objects = () => [
    { container: 'shared-composed-pages', key: 'e2e-old', value: {}, lastModifiedAt: old },
    { container: 'shared-composed-pages', key: 'e2e-new', value: {}, lastModifiedAt: new Date().toISOString() },
    { container: 'shared-composed-pages', key: 'keep-me', value: {}, lastModifiedAt: old },
    { container: 'ai-assistant-settings', key: 'e2e-settings', value: {}, lastModifiedAt: old },
    { container: 'ai-assistant-sessions', key: 'uuid-1', value: { title: 'e2e-t' }, lastModifiedAt: old },
    { container: 'ai-assistant-messages-uuid-1', key: 'm', value: {}, lastModifiedAt: old },
  ];
  const dry = fakeApi(objects());
  const dryLines = [];
  await cleanup(['--sweep', '--dry-run'], { client: dry, log: (l) => dryLines.push(l) });
  assert.equal(dry.removed.length, 0);
  assert.match(dryLines.join('\n'), /would delete shared-composed-pages\/e2e-old/);
  const api = fakeApi(objects());
  await cleanup(['--sweep'], { client: api, log: () => {} });
  assert.deepEqual(api.removed.sort(), ['ai-assistant-messages-uuid-1/m', 'ai-assistant-sessions/uuid-1', 'shared-composed-pages/e2e-old']);
  const again = [];
  await cleanup(['--sweep'], { client: api, log: (l) => again.push(l) });
  assert.match(again.join('\n'), /deleted: 0/);
  assert.equal(await cleanup([], { client: api, log: () => {} }), 2);
});

test('ledgerTargets maps kinds to containers', () => {
  assert.deepEqual(ledgerTargets([{ kind: 'feedback', id: 'f' }, { kind: 'bogus', id: 'z' }]), [{ container: 'ai-assistant-feedback', key: 'f' }]);
});

// ---- co oracle never prints values ---------------------------------------------------------
test('shapeOf and countNeedles do not leak string contents', () => {
  const shape = JSON.stringify(shapeOf({ refresh_token: 'super-secret', nested: { list: ['a', 'b'], n: 1 } }));
  assert.ok(!shape.includes('super-secret'));
  assert.match(shape, /string\(12\)/);
  assert.deepEqual(countNeedles({ a: 'x e2e- e2e-' }, ['e2e-', 'zzz']), { 'e2e-': 2, zzz: 0 });
});

test('co grep exits 1 when a needle is found and prints counts only', async () => {
  const api = fakeApi([{ container: 'ai-assistant-identity-tokens', key: 'k', value: { access_token: 'plain' } }]);
  const lines = [];
  assert.equal(await co(['grep', 'ai-assistant-identity-tokens', 'access_token'], { client: api, log: (l) => lines.push(l) }), 1);
  assert.ok(!lines.join('').includes('plain'));
  assert.equal(await co(['grep', 'ai-assistant-identity-tokens', 'refresh_token'], { client: api, log: () => {} }), 0);
});

// ---- seed fixtures --------------------------------------------------------------------------
test('composed page fixtures are valid and only use e2e- keys', () => {
  const fixtures = loadFixtures();
  assert.deepEqual(fixtures.map((f) => f.key).sort(), ['e2e-bq', 'e2e-broken', 'e2e-draft', 'e2e-orders', 'e2e-param']);
  assert.equal(fixtures.find((f) => f.key === 'e2e-draft').isPublished, false);
  assert.equal(fixtures.find((f) => f.key === 'e2e-bq').components[0].dataSources[0].target, 'BIG_QUERY');
});

test('seed writes one object per fixture through an injected tool and client', async () => {
  const written = [];
  const api = { put: async (c, k, v) => written.push([c, k, v]) };
  const create = async (input) => ({ success: true, schema: { version: '5.0', title: input.title, components: [] } });
  assert.equal(await seed(['composed-pages'], { client: api, log: () => {}, createComposedPage: create }), 0);
  assert.equal(written.length, 5);
  assert.ok(written.every(([c, k]) => c === 'shared-composed-pages' && k.startsWith('e2e-')));
  assert.equal(written.find(([, k]) => k === 'e2e-draft')[2].isPublished, false);
  assert.equal(toStoredValue({ title: 't', isPublished: true }, { schema: { version: '5.0' } }).schema.version, '5.0');
  written.length = 0;
  await seed(['legacy-page'], { client: api, log: () => {} });
  assert.equal(written[0][2].schema.version, '4.0');
  assert.equal(await seed(['nope'], { client: api, log: () => {} }), 2);
});

// ---- two-instance routing ---------------------------------------------------------------------
test('router: pins win, the rest is round robin', () => {
  const pins = parsePins('/authorize=a,/callback=b');
  const route = createRouter(pins);
  assert.equal(route('/service/managed-mcp-identity/authorize'), 'a');
  assert.equal(route('/service/managed-mcp-identity/callback?code=1'), 'b');
  const rr = createRouter(parsePins(''));
  assert.deepEqual([rr('/x'), rr('/x'), rr('/x')], ['a', 'b', 'a']);
  assert.throws(() => parsePins('/x=c'), /bad pin/);
});

// ---- bad jwt ----------------------------------------------------------------------------------
test('make-bad-jwt produces a well-formed token with another audience that no key verifies', () => {
  const token = makeBadJwt(1_000_000);
  const [h, c, s] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.aud, 'https://other.invalid');
  assert.equal(claims.exp, 1_000_060);
  assert.ok(s.length > 100);
  assert.ok(createVerify('RSA-SHA256'));
});

// ---- report and evidence collection ----------------------------------------------------------
test('report counts statuses and flags FAIL and invalid values', () => {
  assert.equal(statusKind('SKIPPED(M10)'), 'SKIPPED');
  assert.equal(statusKind('green'), 'INVALID');
  const r = buildReport('run-x', [
    { id: 'E2E-A-01', folder: 'E2E-A-01', status: 'PASS', durationMs: 4000, title: 'a | b' },
    { id: 'E2E-A-02', folder: 'E2E-A-02', status: 'FAIL', notes: 'x|y' },
    { id: 'E2E-A-03', folder: 'E2E-A-03', status: 'SKIPPED(M10)' },
  ]);
  assert.equal(r.failed, 1);
  assert.match(r.text, /Scenarios: 3\. PASS: 1, FAIL: 1, SKIPPED: 1\./);
  assert.match(r.text, /\| E2E-A-01 \| a \| b \|/s);
});

function runCollect(run, tmpBase, evidenceRoot) {
  return spawnSync('bash', [join(REPO, 'scripts/e2e/collect-evidence.sh'), run], {
    env: { ...process.env, E2E_TMP: tmpBase, E2E_EVIDENCE_ROOT: evidenceRoot },
    encoding: 'utf8',
  });
}

test('collect-evidence.sh moves the run folder and writes a two-row report', () => {
  const base = tmp();
  const evidence = tmp();
  const run = '20261009-1200-local';
  for (const [id, status] of [['E2E-A-01', 'PASS'], ['E2E-A-02', 'SKIPPED(M10)']]) {
    const dir = join(base, 'e2e', run, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'result.json'), JSON.stringify({ id, status, durationMs: 1000 }));
  }
  const r = runCollect(run, base, evidence);
  assert.equal(r.status, 0, r.stderr);
  const report = readFileSync(join(evidence, run, 'report.md'), 'utf8');
  assert.equal(report.split('\n').filter((l) => l.startsWith('| E2E-')).length, 2);
  assert.ok(existsSync(join(evidence, run, 'E2E-A-01', 'result.json')));
});

test('collect-evidence.sh exits 1 when a scenario failed and 2 on a bad run id', () => {
  const base = tmp();
  const evidence = tmp();
  const dir = join(base, 'e2e', 'run-f', 'E2E-A-01');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ id: 'E2E-A-01', status: 'FAIL' }));
  assert.equal(runCollect('run-f', base, evidence).status, 1);
  assert.equal(runCollect('../x', base, evidence).status, 2);
});
