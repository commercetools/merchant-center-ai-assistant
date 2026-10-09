/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'check-duplicates.mjs');
const COPIES = [
  'service/src/composed-pages/contract.ts',
  'mc-app/src/utils/babel-renderer.tsx',
  'composed-apps/src/utils/babel-renderer.tsx',
];

function run(root) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, CHECK_ROOT: root },
    encoding: 'utf8',
  });
  return { code: result.status, out: result.stdout };
}

// The tree only holds the three isUsableTranspiledCode copies; the byte-identical groups are
// reported as MISSING there, so these tests look at the semantics lines only.
function withCopies(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'check-duplicates-'));
  try {
    for (const file of COPIES) {
      const target = join(root, file);
      mkdirSync(dirname(target), { recursive: true });
      const source = readFileSync(join(REPO, file), 'utf8');
      writeFileSync(target, mutate(file, source));
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('check-duplicates: the repository passes', () => {
  const result = run(REPO);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /isUsableTranspiledCode in 3 copies/);
});

test('check-duplicates: identical semantics report no isUsableTranspiledCode drift', () => {
  const result = withCopies((_file, source) => source);
  assert.doesNotMatch(result.out, /isUsableTranspiledCode/);
});

test('check-duplicates: a copy that loosens the shape check is reported', () => {
  const result = withCopies((file, source) =>
    file.startsWith('composed-apps/') ? source.replace("'FunctionDeclaration'", "'FunctionExpression'") : source
  );
  assert.match(result.out, /DRIFT isUsableTranspiledCode: composed-apps\/src\/utils\/babel-renderer\.tsx/);
});

test('check-duplicates: a copy that accepts a one-statement script is reported', () => {
  const result = withCopies((file, source) =>
    file.startsWith('mc-app/') ? source.replace('body.length < 2', 'body.length < 1') : source
  );
  assert.match(result.out, /DRIFT isUsableTranspiledCode: mc-app\/src\/utils\/babel-renderer\.tsx/);
});

test('check-duplicates: a missing copy is reported', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-duplicates-'));
  try {
    const result = run(root);
    assert.equal(result.code, 1);
    assert.match(result.out, /MISSING isUsableTranspiledCode: service\/src\/composed-pages\/contract\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
