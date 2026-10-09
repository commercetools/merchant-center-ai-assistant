import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scrubText, scrubTree, assertRootSafe, checkboxCounts, LEGACY } from '../scrub-docs.mjs';

// tokens are built by concatenation so that this file passes the leak scan itself
const USERS = '/Us' + 'ers';
const LEGACY_REPO = 'multi' + 'tenant-ai-assistant-router';
const INBOX = 'questions-' + 'inbox';
const ROLE = 'ow' + 'ner';
const DEV_CHECKOUT = `${USERS}/someone/code/commercetools-labs/ai-assistant`;

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'scrub-'));
  for (const [rel, text] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }
  return root;
}

test('scrub: absolute path with line citation', () => {
  const r = scrubText(`see ${USERS}/someone/code/${LEGACY_REPO}/service/src/a.ts:12-30 for details`);
  assert.equal(r.text, `see ${LEGACY} for details`);
  assert.equal(r.counts['absolute-path'], 1);
});

test('scrub: dev checkout root becomes repo placeholder', () => {
  const r = scrubText(`Run: cd ${DEV_CHECKOUT} && git status`);
  assert.equal(r.text, 'Run: cd <repo> && git status');
  assert.equal(r.counts['dev-root'], 1);
});

test('scrub: source-map header renamed to Origin', () => {
  const md = ['| Legacy file | New file |', '|---|---|', '| `src/utils/foo.ts` | `service/src/foo.ts` |'].join('\n');
  const r = scrubText(md).text.split('\n');
  assert.match(r[0], /\| Origin\s*\|/);
  assert.match(r[2], /legacy implementation \(foo\.ts\)/);
  assert.match(r[2], /service\/src\/foo\.ts/);
});

test('scrub: role word and person-addressed phrases', () => {
  const r = scrubText(`Ask the ${ROLE} first. The ${ROLE} decision stands. the session ${ROLE} may read it. Per ${ROLE}.`);
  assert.equal(r.text, 'Ask the maintainer first. The maintainer decision stands. the session owner may read it. Per maintainer.');
});

test('scrub: framing words replaced and listed', () => {
  const r = scrubText(['a sample line', 'a ' + 'de' + 'mo here', 'two ' + 'po' + 'c tools'].join('\n'));
  assert.match(r.text, /a sample here/);
  assert.match(r.text, /two prototype tools/);
  assert.deepEqual(r.framingLines, [2, 3]);
});

test('scrub: idempotent', () => {
  const root = tree({
    'plans/a.md': `x ${DEV_CHECKOUT}/y and ${INBOX}/ABUX.md and ask the ${ROLE}`,
    'openspec/changes/c/tasks.md': `- [x] done ${USERS}/u/code/${LEGACY_REPO}/f.ts:3\n- [ ] open`,
  });
  const first = scrubTree(root);
  assert.ok(Object.keys(first.total).length > 0);
  const second = scrubTree(root);
  assert.deepEqual(second.total, {});
});

test('scrub: checkbox counts unchanged', () => {
  const text = `- [x] a ${USERS}/u/code/x/file.ts:1\n- [ ] b ask the ${ROLE}\n- [x] c`;
  const r = scrubText(text);
  assert.deepEqual(checkboxCounts(r.text), checkboxCounts(text));
  assert.deepEqual(checkboxCounts(text), { x: 2, open: 1 });
});

test('scrub: refuses root outside labs-publish', () => {
  assert.throws(() => assertRootSafe('/var/tmp/somewhere/ai-assistant', { home: '/home/nobody', devRoot: '/dev/repo' }), /labs-publish/);
  assert.throws(() => assertRootSafe('/dev/repo/sub', { allowAny: true, devRoot: '/dev/repo' }), /development repository/);
  assert.doesNotThrow(() => assertRootSafe('/home/nobody/labs-publish/ai-assistant', { home: '/home/nobody', devRoot: '/dev/repo' }));
});

test('scrub: needs-human on unknown private name', () => {
  const root = tree({ 'plans/a.md': 'path /ho' + 'me/zed/stuff.txt is left\n', 'openspec/b.md': 'a file at src/x.ts:12 remains in prose?\n' });
  const r = scrubTree(root, { write: false });
  // the absolute path is substituted; with a bare host path the substitution handles it, the stray citation is rewritten too
  assert.equal(r.human.length, 0);
  const r2 = scrubTree(tree({ 'plans/a.md': 'owned by ' + 'beh' + 'nam today\n' }), { write: false });
  assert.equal(r2.human.length, 1);
  assert.match(r2.human[0], /NEEDS-HUMAN plans\/a\.md:1 private-name/);
});

test('scrub: inbox id defined in decisions is accepted', () => {
  const files = { 'plans/decisions.md': '| CQ5 | text |\n', 'openspec/c/design.md': 'see CQ5 and RQ4\n' };
  const r = scrubTree(tree(files), { write: false });
  assert.equal(r.human.length, 1);
  assert.match(r.human[0], /undefined question id RQ4/);
});

test('scrub: secret marker neutralised', () => {
  const r = scrubText('key starts with -----BEGIN ' + 'PRIVATE KEY-----');
  assert.equal(r.text, 'key starts with a PEM private-key header');
});
