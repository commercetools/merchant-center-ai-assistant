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
import { checkText, findTaskFiles, hasLabel, run } from './check-tasks-shape.mjs';

const GOOD_TASK = `- [ ] 2.1 Do it
  **Why:** a
  **Where:** b
  **How:** c
  **Done when:** d
  **Watch out:** e
`;
const GOOD = `## 0. Read first\n- [ ] 0.1 Read\n\n## 1. Setup\n- [ ] 1.1 Run\n\n## 2. Work\n${GOOD_TASK}\n## 3. Verification\n- x\n\n## 4. Docs to update\n- y\n`;

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { log: (s) => out.push(s), err: (s) => err.push(s) } };
}
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'shape-'));
  mkdirSync(root, { recursive: true });
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

test('labels match bold and plain forms', () => {
  assert.ok(hasLabel('**Why:** x', 'Why'));
  assert.ok(hasLabel('  Why: x', 'Why'));
  assert.ok(hasLabel('- **Done when**: x', 'Done when'));
  assert.ok(!hasLabel('Because', 'Why'));
});

test('a complete file has no errors', () => {
  const r = checkText(GOOD);
  assert.deepEqual(r.errors, []);
  assert.equal(r.tasks, 3);
});

test('missing sections and labels are errors; setup tasks only warn', () => {
  const bad = `## 0. Read first\n- [ ] 0.1 Read\n\n## 1. Setup\n- [ ] 1.1 Run\n\n## 2. Work\n- [ ] 2.1 Do it\n  **Why:** a\n`;
  const r = checkText(bad);
  assert.ok(r.errors.includes('missing Verification section'));
  assert.ok(r.errors.includes('missing "Docs to update" section'));
  assert.ok(r.errors.some((e) => /task 2\.1: missing Where, How, Done when, Watch out/.test(e)));
  assert.ok(r.warnings.some((w) => /task 1\.1/.test(w)));
  assert.ok(!r.errors.some((e) => /task 1\.1|task 0\.1/.test(e)));
});

test('a task marked shared warns instead of failing', () => {
  const t = GOOD.replace(GOOD_TASK, '- [ ] 2.1 Do it\n  Shared Where/How/Done/Watch out: see 2.0\n');
  const r = checkText(t);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /task 2\.1/.test(w)));
});

test('files are found in archive and active changes; exit codes', () => {
  const root = tree({ 'openspec/changes/archive/2026-01-01-a/tasks.md': GOOD, 'openspec/changes/b/tasks.md': '## nothing\n' });
  assert.equal(findTaskFiles(root).length, 2);
  const c = capture();
  assert.equal(run(['--root', root], c.io), 1);
  assert.ok(c.err.some((l) => /missing "Read first"/.test(l)));
  assert.match(c.out.at(-1), /checked 2 files, 3 tasks, \d+ errors/);
  const ok = tree({ 'openspec/changes/archive/a/tasks.md': GOOD });
  assert.equal(run(['--root', ok], capture().io), 0);
  assert.equal(run(['--root', tree({})], capture().io), 2);
});
