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
import {
  extractIds,
  inventoryRows,
  lintCards,
  parseCards,
  parseTiers,
  run,
  splitRow,
  tierProblems,
  traceProblems,
  traceRows,
} from '../e2e/extract-scenario-ids.mjs';

const GOOD = `### E2E-A-01 - A card
- Spec: x / y
- Tags: smoke, needs:M8
- Env: both
- Budget: 60
- Pre: none
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL"}
  2. SHELL: \`curl -s "$SERVICE_URL/service/status"\`
- Assert:
  A1 [NET] status 200
  A2 [DOM] text present
- Cleanup: none
- Evidence: snapshot-final.txt
- Status: NOT RUN
`;

const lint = (text, file = 'A-test.md') => lintCards(parseCards(text, file));

test('extractIds finds ids, suffixes and ranges', () => {
  assert.deepEqual(extractIds('E2E-I-05b and E2E-O-01..06'), ['E2E-I-05b', 'E2E-O-01', 'E2E-O-02', 'E2E-O-03', 'E2E-O-04', 'E2E-O-05', 'E2E-O-06']);
  assert.deepEqual(extractIds('E2E-P-01 .. E2E-P-03, E2E-P-02'), ['E2E-P-01', 'E2E-P-02', 'E2E-P-03']);
  assert.deepEqual(extractIds('E2E-O-* and E2E-X'), []);
});

test('a complete card passes the lint', () => {
  assert.deepEqual(lint(GOOD), []);
});

test('lint reports a missing key, a bad tag, a bad env and a bad status', () => {
  const bad = GOOD.replace('- Cleanup: none\n', '').replace('smoke', 'flaky').replace('Env: both', 'Env: moon').replace('NOT RUN', 'GREEN');
  const problems = lint(bad).join('\n');
  assert.match(problems, /missing "- Cleanup:"/);
  assert.match(problems, /unknown tag "flaky"/);
  assert.match(problems, /Env must start with/);
  assert.match(problems, /Status "GREEN"/);
});

test('lint requires pageId on page-scoped tools and rejects unknown tools', () => {
  const noPage = GOOD.replace('{pageId: $P, type', '{type');
  assert.match(lint(noPage).join('\n'), /without pageId/);
  const unknown = GOOD.replace('navigate_page', 'teleport_page');
  assert.match(lint(unknown).join('\n'), /unknown tool mcp__chrome-devtools__teleport_page/);
  const listPages = GOOD.replace('navigate_page {pageId: $P, type: "url", url: "$APP_URL"}', 'list_pages {}');
  assert.deepEqual(lint(listPages), []);
});

test('lint requires oracle tags on assertions and steps numbered', () => {
  assert.match(lint(GOOD.replace('A1 [NET]', 'A1')).join('\n'), /without oracle tag/);
  assert.match(lint(GOOD.replace('A1 [NET]', 'A1 [SMELL]')).join('\n'), /without oracle tag/);
  assert.match(lint(GOOD.replace(/  1\. .*\n/, '').replace(/  2\. .*\n/, '')).join('\n'), /no numbered step/);
});

test('lint rejects bad ids, duplicates and a letter that does not match the file', () => {
  assert.match(lint(GOOD.replace('E2E-A-01', 'E2E-A-1')).join('\n'), /heading must be/);
  const dup = `${GOOD}\n${GOOD}`;
  assert.match(lint(dup).join('\n'), /duplicate id/);
  assert.match(lint(GOOD, 'B-other.md').join('\n'), /does not match file/);
});

test('cards inside code fences are not parsed', () => {
  const doc = '```\n### E2E-A-01 - Example\n- Spec: x\n```\n';
  assert.deepEqual(parseCards(doc), []);
});

test('splitRow keeps pipes inside backticks and the inventory counts KEEP and CHANGE rows only', () => {
  assert.deepEqual(splitRow('| a `x | y` | KEEP | z |'), ['a `x | y`', 'KEEP', 'z']);
  const md = `| Feature | Verdict | Spec |
|---|---|---|
| one | KEEP | C |
| two | CHANGE | D |
| three | DROP | - |
| four | KEEP (guarded) | D |

| Package | Type | Verdict | Spec |
|---|---|---|---|
| mc-app | App | KEEP, more | O |
`;
  assert.deepEqual(inventoryRows(md).map((r) => r.feature), ['one', 'two', 'four', 'mc-app']);
});

test('traceProblems checks ids, cards, row count and feature text', () => {
  const inv = [{ feature: 'one' }, { feature: 'two' }];
  const rows = traceRows('| 1 | one | C | E2E-A-01 |\n| 2 | two | C | E2E-A-09 |\n| X1 | extra | C | E2E-A-01 |\n');
  const problems = traceProblems(inv, rows, new Set(['E2E-A-01'])).join('\n');
  assert.match(problems, /E2E-A-09 has no card/);
  assert.equal(traceRows('| 1 | one | C | none |').at(0).ids.length, 0);
  assert.match(traceProblems(inv, traceRows('| 1 | one | C | E2E-A-01 |'), new Set(['E2E-A-01'])).join('\n'), /trace has 1 rows, plans\/01 has 2/);
  assert.deepEqual(traceProblems(inv.slice(0, 1), traceRows('| 1 | one | C | E2E-A-01 |'), new Set(['E2E-A-01'])), []);
});

test('tiers: every card in exactly one tier', () => {
  const tiers = parseTiers('## Tier 0 - a\nE2E-A-01\n## Tier 1 - b\nE2E-A-02, E2E-A-01\n## Other\nE2E-A-03\n');
  const problems = tierProblems(tiers, new Set(['E2E-A-01', 'E2E-A-02', 'E2E-A-04'])).join('\n');
  assert.match(problems, /E2E-A-01 is in two tiers/);
  assert.match(problems, /E2E-A-04 is in no tier/);
  assert.deepEqual(tierProblems(parseTiers('## Tier 0\nE2E-A-01\n'), new Set(['E2E-A-01'])), []);
});

function fixtureRepo({ card = GOOD, taskIds = 'E2E-A-01' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'e2e-ids-'));
  mkdirSync(join(root, 'e2e'));
  mkdirSync(join(root, 'plans'));
  mkdirSync(join(root, 'openspec', 'changes', 'a-change'), { recursive: true });
  writeFileSync(join(root, 'e2e', 'A-test.md'), card);
  writeFileSync(join(root, 'openspec', 'changes', 'a-change', 'tasks.md'), `- Chrome scenarios ${taskIds}\n`);
  writeFileSync(join(root, 'plans', '01-source-inventory.md'), '| Feature | Verdict |\n|---|---|\n| one | KEEP |\n');
  writeFileSync(join(root, 'e2e', '03-traceability.md'), '| 1 | one | A | E2E-A-01 |\n');
  writeFileSync(join(root, 'e2e', '02-regression-order.md'), '## Tier 0 - all\nE2E-A-01\n');
  return root;
}

const capture = (argv) => {
  const out = [];
  const err = [];
  const code = run(argv, (l) => out.push(l), (l) => err.push(l));
  return { code, out: out.join('\n'), err: err.join('\n') };
};

test('run: all modes pass on a consistent tree', () => {
  const root = fixtureRepo();
  const r = capture(['--root', root, '--list', '--lint', '--dangling', '--trace', '--tiers']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /E2E-A-01/);
  assert.match(r.out, /trace ok \(1 mapped features = 1 KEEP\/CHANGE rows/);
});

test('run: a task id without a card is dangling and exits 1', () => {
  const root = fixtureRepo({ taskIds: 'E2E-A-01 and E2E-A-07' });
  const r = capture(['--root', root, '--dangling']);
  assert.equal(r.code, 1);
  assert.match(r.err, /E2E-A-07/);
});

test('run: an incomplete card fails the lint with exit 1, no mode is exit 2', () => {
  const root = fixtureRepo({ card: GOOD.replace('- Budget: 60\n', '') });
  assert.equal(capture(['--root', root, '--lint']).code, 1);
  assert.equal(capture(['--root', root]).code, 2);
});
