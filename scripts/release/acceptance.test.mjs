/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHANGES, checkVersions, collect, extractScenarioIds, findArchived, findings, parseReport, renderTable, run, taskCounts, verificationSection } from './acceptance.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'accept-'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}
function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { log: (s) => out.push(s), err: (s) => err.push(s) } };
}

const TASKS = `## 9. Verification\n\n- Commands: \`node scripts/spdx-check.mjs\`, \`cd service && npm test\`.\n- Chrome: E2E-D-01..D-03 and E2E-V-13.\n\n## 10. Docs to update\n- x\n- [ ] 1.1 a\n- [x] 1.2 b\n`;

test('findArchived matches by suffix and by exact name', () => {
  const root = tree({ 'openspec/changes/archive/2026-10-09-b-connect-skeleton/tasks.md': '', 'openspec/changes/archive/a-repo-bootstrap-labs-compliance/tasks.md': '' });
  assert.equal(findArchived(root, 'b-connect-skeleton'), 'openspec/changes/archive/2026-10-09-b-connect-skeleton');
  assert.equal(findArchived(root, 'a-repo-bootstrap-labs-compliance'), 'openspec/changes/archive/a-repo-bootstrap-labs-compliance');
  assert.equal(findArchived(root, 'c-service-foundation'), null);
});

test('verification section, commands, ids and task counts', () => {
  const sec = verificationSection(TASKS);
  assert.match(sec, /spdx-check/);
  assert.doesNotMatch(sec, /Docs to update/);
  assert.deepEqual(extractScenarioIds(sec), ['E2E-D-01', 'E2E-D-02', 'E2E-D-03', 'E2E-V-13']);
  assert.deepEqual(taskCounts(TASKS), { done: 1, open: 1 });
});

test('parseReport reads the status column', () => {
  const m = parseReport('| id | title | env | status |\n|---|---|---|---|\n| E2E-C-01 | t | sandbox | PASS | 3 s | x | |\n| E2E-C-02 | t | sandbox | SKIPPED(M4) | | | |\n');
  assert.equal(m.get('E2E-C-01'), 'PASS');
  assert.equal(m.get('E2E-C-02'), 'SKIPPED(M4)');
});

test('missing archive is named and --check exits non-zero', () => {
  const root = tree({ 'openspec/changes/c-service-foundation/tasks.md': TASKS });
  const c = capture();
  assert.equal(run(['--check', '--root', root], c.io), 1);
  assert.ok(c.err.some((l) => /C c-service-foundation: not archived/.test(l)));
});

test('never PASS without evidence; scenario FAIL and missing link are findings', () => {
  const files = {};
  for (const [, name] of CHANGES) files[`openspec/changes/archive/${name}/tasks.md`] = TASKS;
  files['plans/evidence/run1/report.md'] = '| E2E-D-01 | t | s | FAIL | | | |\n';
  files['plans/evidence/z/acceptance-evidence.json'] = JSON.stringify({ A: { verdict: 'PASS', verifier: 'agent', links: ['plans/evidence/z/nope.md'] } });
  const root = tree(files);
  const { rows } = collect(root);
  const f = findings(rows);
  assert.ok(f.some((x) => /D: scenario E2E-D-01 is FAIL/.test(x)));
  assert.ok(f.some((x) => /A: evidence link does not exist/.test(x)));
  assert.ok(f.some((x) => /B: verdict NOT VERIFIED/.test(x)));
  assert.ok(!f.some((x) => /not archived/.test(x)));
});

test('--check passes only with PASS verdicts, verifier and existing links', () => {
  const files = {};
  const ev = {};
  for (const [id, name] of CHANGES) {
    files[`openspec/changes/archive/${name}/tasks.md`] = TASKS;
    ev[id] = { verdict: 'PASS', verifier: 'agent', links: ['plans/evidence/z/ok.md'] };
  }
  files['plans/evidence/z/ok.md'] = 'ok';
  files['plans/evidence/z/acceptance-evidence.json'] = JSON.stringify(ev);
  const root = tree(files);
  assert.equal(run(['--check', '--root', root], capture().io), 0);
});

test('--table writes the table with NOT VERIFIED rows and the not-required rows', () => {
  const root = tree({ 'openspec/changes/c-service-foundation/tasks.md': TASKS });
  assert.equal(run(['--table', '--root', root], capture().io), 0);
  const { rows } = collect(root);
  const text = renderTable(rows, null);
  assert.match(text, /\| C \| `c-service-foundation` \| NO \(active change\)/);
  assert.match(text, /NOT VERIFIED/);
  assert.match(text, /\| T \| - \| n\/a/);
  assert.doesNotMatch(text, /\| PASS \|\s*$/m);
});

test('--versions', () => {
  const pk = (v) => JSON.stringify({ name: 'x', version: v });
  const files = { 'service/package.json': pk('0.1.0'), 'mc-app/package.json': pk('0.1.0'), 'composed-apps/package.json': pk('0.1.0'), 'mc-view-app/package.json': pk('0.1.0'), 'CHANGELOG.md': '# Changelog\n\n## 0.1.0 - first\n' };
  const ok = tree(files);
  assert.deepEqual(checkVersions(ok, '0.1.0'), []);
  const c = capture();
  assert.equal(run(['--versions', '0.1.0', '--root', ok], c.io), 0);
  assert.match(c.out[0], /^OK/);
  const bad = tree({ ...files, 'mc-app/package.json': pk('1.0.0'), 'CHANGELOG.md': '## 0.2.0\n' });
  assert.equal(checkVersions(bad, '0.1.0').length, 2);
  assert.equal(run(['--versions', '--root', bad], capture().io), 1);
});

test('usage error', () => {
  assert.equal(run([], capture().io), 2);
});
