import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText, scanTree, loadPatterns } from '../leak-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATTERN_FILE = join(HERE, '..', 'leak-patterns.json');
// tokens are built by concatenation so that this file passes the scan itself
const TUNNEL = 'ng' + 'rok';
const HOME_PATH = '/Us' + 'ers/someone/code';
const fakePolicy = { block: { names: ['Acme Widgets'] } };

test('leak: block pattern hit', () => {
  const p = loadPatterns(PATTERN_FILE);
  const hits = scanText(`host: https://x.${TUNNEL}.io/path`, p.block);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].match, TUNNEL);
});

test('leak: pattern does not match itself', () => {
  const j = JSON.parse(readFileSync(PATTERN_FILE, 'utf8'));
  const all = [...j.block, ...j.blockPrivate, ...j.review];
  const text = readFileSync(PATTERN_FILE, 'utf8');
  for (const pat of all) {
    assert.equal(new RegExp(pat, 'i').test(text), false, `pattern matches its own file: ${pat}`);
  }
  assert.ok(j.block.length >= 22);
});

test('leak: markdown under openspec is scanned', () => {
  const root = mkdtempSync(join(tmpdir(), 'leak-'));
  mkdirSync(join(root, 'openspec', 'changes', 'archive', 'x'), { recursive: true });
  writeFileSync(join(root, 'openspec', 'changes', 'archive', 'x', 'design.md'), `see ${HOME_PATH}/file.ts:12\n`);
  const r = scanTree(root, loadPatterns(PATTERN_FILE));
  assert.equal(r.block.length, 1);
  assert.equal(r.block[0].path, join('openspec', 'changes', 'archive', 'x', 'design.md'));
});

test('leak: review pattern listed not failed', () => {
  const root = mkdtempSync(join(tmpdir(), 'leak-'));
  writeFileSync(join(root, 'notes.md'), 'Fire' + 'store was replaced.\n');
  const r = scanTree(root, loadPatterns(PATTERN_FILE));
  assert.equal(r.block.length, 0);
  assert.equal(r.review.length, 1);
});

test('leak: customer name from policy', () => {
  const p = loadPatterns(PATTERN_FILE, fakePolicy);
  assert.equal(scanText('prepared for acme-widgets today', p.block).length, 1);
  assert.equal(scanText('acmewidgetsx is fine', p.block).length, 0);
});

test('leak: binary skipped', () => {
  const root = mkdtempSync(join(tmpdir(), 'leak-'));
  writeFileSync(join(root, 'img.png'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(TUNNEL)]));
  const r = scanTree(root, loadPatterns(PATTERN_FILE));
  assert.equal(r.block.length, 0);
  assert.equal(r.skippedBinary, 1);
});

test('leak: line numbers', () => {
  const p = loadPatterns(PATTERN_FILE);
  const hits = scanText(`a\nb\nuse ${TUNNEL}\n`, p.block);
  assert.equal(hits[0].line, 3);
});
