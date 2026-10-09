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
import { extractLinks, run } from './check-links.mjs';
import { slugify } from './lib.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('slugs follow the GitHub rules', () => {
  assert.equal(slugify('Fail-open and fail-closed behaviour'), 'fail-open-and-fail-closed-behaviour');
  assert.equal(slugify('`GET /service/status` (health)'), 'get-servicestatus-health');
  assert.equal(slugify('Quick start (local)'), 'quick-start-local');
});

test('links in code are ignored', () => {
  const links = extractLinks('a [x](y.md)\n`[z](no.md)`\n```\n[q](nope.md)\n```\n');
  assert.deepEqual(links.map((l) => l.target), ['y.md']);
});

test('a consistent tree passes', () => {
  const root = tree({
    'README.md': '# Title\n\n## Setup steps\n\nSee [docs](docs/a.md#part-one) and [self](#setup-steps) and [site](https://example.com).\n',
    'docs/a.md': '# A\n\n## Part one\n\nBack to [readme](../README.md).\n',
  });
  assert.equal(run(['--root', root], () => {}), 0);
});

test('a broken file link exits 1 and prints file:line', () => {
  const root = tree({ 'README.md': '# T\n\ntext\n[gone](docs/missing.md)\n' });
  const lines = [];
  assert.equal(run(['--root', root], (l) => lines.push(l)), 1);
  assert.ok(lines.includes('BROKEN-LINK README.md:4 docs/missing.md'));
});

test('a broken anchor exits 1', () => {
  const root = tree({ 'README.md': '# T\n\n[x](docs/a.md#nope)\n', 'docs/a.md': '# A\n' });
  const lines = [];
  assert.equal(run(['--root', root], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.startsWith('BROKEN-ANCHOR README.md:3')));
});

test('links into internal material are rejected even when the target exists', () => {
  const root = tree({ 'README.md': '# T\n\n[a](plans/x.md) [b](openspec/y.md) [c](file:///tmp/z)\n', 'plans/x.md': 'x', 'openspec/y.md': 'y' });
  const lines = [];
  assert.equal(run(['--root', root], (l) => lines.push(l)), 1);
  assert.equal(lines.filter((l) => l.startsWith('INTERNAL-LINK')).length, 3);
});

test('--list-external prints http links without fetching them', () => {
  const root = tree({ 'README.md': '# T\n\n[x](https://example.com/a)\n' });
  const lines = [];
  assert.equal(run(['--root', root, '--list-external'], (l) => lines.push(l)), 0);
  assert.ok(lines.some((l) => l.startsWith('EXTERNAL README.md:3 https://example.com/a')));
});
