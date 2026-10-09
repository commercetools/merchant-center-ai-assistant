/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSessions, buildSnapshotBody, loadSeed, run as seed } from '../e2e/seed.mjs';
import { isE2eObject } from '../e2e/lib/e2e-objects.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'e2e-seeds-'));

test('seed definitions exist and only use the e2e- marker', () => {
  const many = loadSeed('sessions-many');
  assert.equal(many.container, 'ai-assistant-sessions');
  assert.ok(many.keyPrefix.startsWith('e2e-') && many.titlePrefix.startsWith('e2e-'));
  const large = loadSeed('large-snapshot');
  assert.ok(large.sessionKey.startsWith('e2e-') && large.comment.startsWith('e2e-'));
  assert.ok(large.sizes.accepted < large.sizes.rejected);
});

test('sessions-many: builds sessions the cleanup guard recognises', () => {
  const rows = buildSessions(3, 'user-a', loadSeed('sessions-many'), 1_000_000);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.key), ['e2e-sm-0001', 'e2e-sm-0002', 'e2e-sm-0003']);
  assert.ok(rows.every((r) => isE2eObject(r.container, r.key, r.value)));
  assert.ok(rows.every((r) => r.value.userId === 'user-a' && r.value.schemaVersion === 1));
  assert.ok(rows[0].value.createdAt < rows[2].value.createdAt);
  assert.throws(() => buildSessions(0, 'user-a'), /--count/);
  assert.throws(() => buildSessions(5000, 'user-a'), /--count/);
  assert.throws(() => buildSessions(2, '../x'), /--user-id/);
  assert.throws(() => buildSessions(2, undefined), /--user-id/);
});

test('sessions-many: writes through the client, dry run writes nothing', async () => {
  const written = [];
  const api = { put: async (c, k, v) => written.push([c, k, v]) };
  assert.equal(await seed(['sessions-many', '--user-id', 'user-a', '--count', '7'], { client: api, log: () => {} }), 0);
  assert.equal(written.length, 7);
  written.length = 0;
  assert.equal(await seed(['sessions-many', '--user-id', 'user-a', '--dry-run'], { client: api, log: () => {} }), 0);
  assert.equal(written.length, 120);
  assert.equal(await seed(['sessions-many', '--count', '3'], { client: api, log: () => {} }), 2);
});

test('large-snapshot: body size is close to the requested size and filler only', () => {
  const body = buildSnapshotBody('e2e-large-snapshot', 1_000_000, loadSeed('large-snapshot'));
  const size = Buffer.byteLength(JSON.stringify(body));
  assert.ok(size > 1_000_000 && size < 1_000_000 + 20_000, `size ${size}`);
  assert.equal(body.comment, 'e2e-large-snapshot');
  assert.ok(body.messages.length > 1);
  assert.ok(body.messages.every((m) => m.id.startsWith('e2e-') && /^x+$/.test(m.parts[0].text)));
  assert.throws(() => buildSnapshotBody('s', 10), /at least/);
});

test('large-snapshot: writes the payload files and optionally one session', async () => {
  const dir = tmp();
  const written = [];
  const api = { put: async (c, k, v) => written.push([c, k, v]) };
  const lines = [];
  assert.equal(await seed(['large-snapshot', '--out', dir], { client: api, log: (l) => lines.push(l) }), 0);
  assert.equal(written.length, 0);
  const accepted = statSync(join(dir, 'large-snapshot-accepted.json')).size;
  const rejected = statSync(join(dir, 'large-snapshot-rejected.json')).size;
  assert.ok(accepted > 6 * 1048576 && accepted < 6.1 * 1048576);
  assert.ok(rejected > 11 * 1048576 && rejected < 11.2 * 1048576);
  assert.equal(JSON.parse(readFileSync(join(dir, 'large-snapshot-accepted.json'), 'utf8')).sessionId, 'e2e-large-snapshot');
  assert.equal(await seed(['large-snapshot', '--out', dir, '--user-id', 'user-a'], { client: api, log: () => {} }), 0);
  assert.deepEqual(written.map(([c, k]) => [c, k]), [['ai-assistant-sessions', 'e2e-large-snapshot']]);
  assert.equal(await seed(['large-snapshot', '--out', dir, '--user-id', '../x'], { client: api, log: () => {} }), 2);
});

// ---- collect-evidence scrub pass --------------------------------------------------------------
function collect(run, files) {
  const base = tmp();
  const src = join(base, 'tmp', 'e2e', run);
  mkdirSync(src, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(src, name), text);
  const evidence = join(base, 'evidence');
  const r = spawnSync('bash', [join(REPO, 'scripts', 'e2e', 'collect-evidence.sh'), run], {
    env: { ...process.env, E2E_TMP: join(base, 'tmp'), E2E_EVIDENCE_ROOT: evidence },
    encoding: 'utf8',
  });
  return { ...r, evidence, dest: join(evidence, run) };
}

test('collect-evidence: clean evidence passes the scrub pass', () => {
  const r = collect('run-clean', { 'console.txt': 'GET /service/status 200\nno secrets here\n' });
  assert.ok(!/scrub/i.test(r.stderr), r.stderr);
  assert.ok(existsSync(join(r.dest, 'console.txt')));
});

test('collect-evidence: secrets and tokens are redacted in place and reported', () => {
  const r = collect('run-leak', {
    'network.json': JSON.stringify({ headers: { authorization: 'Bearer abc.def.ghi', cookie: 'sid=1234567890abcdef' } }),
    'console.txt': 'key sk_test_ABCDEFGHIJKLMNOP and users bob@example.org and carol@corp.test.invalid\n',
  });
  assert.match(r.stderr, /scrub: redacted/);
  const net = readFileSync(join(r.dest, 'network.json'), 'utf8');
  assert.ok(!net.includes('abc.def.ghi') && !net.includes('1234567890abcdef'));
  const cons = readFileSync(join(r.dest, 'console.txt'), 'utf8');
  assert.ok(!cons.includes('sk_test_ABCDEFGHIJKLMNOP'));
  assert.ok(cons.includes('bob@example.org'), 'example addresses are allowed');
  assert.ok(!cons.includes('carol@'), 'other addresses are redacted');
});

test('collect-evidence: deployed and tunnel hosts are redacted', () => {
  const r = collect('run-host', {
    'console.txt': 'fetch https://service-abc.europe-west1.gcp.commercetools.app/service/status and https://quiet-lake-1.trycloudflare.com/x\n',
  });
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const t = readFileSync(join(r.dest, 'console.txt'), 'utf8');
  assert.ok(!t.includes('commercetools.app') && !t.includes('trycloudflare'));
  assert.ok(t.includes('https://<deployed-service-host>/service/status'));
});

test('collect-evidence: a private key block is a refusal (exit 2) and nothing is kept', () => {
  const k = collect('run-key', { 'a.txt': '-----BEGIN PRIVATE KEY-----\nMIIE\n' });
  assert.equal(k.status, 2, k.stderr);
  assert.match(k.stderr, /scrub: refusing/);
  assert.ok(!existsSync(k.dest));
});
