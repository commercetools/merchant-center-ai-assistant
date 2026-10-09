/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Built with concatenation so this file does not match the repository-wide grep it supports.
const FORBIDDEN = [
  ['g', 'cloud'].join(''),
  ['docker', ' push'].join(''),
  ['terra', 'form'].join(''),
  ['kube', 'ctl'].join(''),
  ['gh', ' workflow'].join(''),
];

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test('no-ci: deployment scripts and lifecycle scripts name no forbidden tooling', () => {
  const targets = [...files(join(ROOT, 'scripts', 'connect')), ...files(join(ROOT, 'service', 'src', 'connector'))];
  assert.ok(targets.length > 5, 'the scan found the deployment scripts');
  for (const file of targets) {
    const text = readFileSync(file, 'utf8');
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `${file} contains '${word}'`);
    }
  }
});

test('no-ci: there is no .github directory', () => {
  assert.equal(existsSync(join(ROOT, '.github')), false);
});

test('no-ci: connect.mjs imports only node: modules and local files', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'connect', 'connect.mjs'), 'utf8');
  const specifiers = [...source.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gms)].map((m) => m[1]);
  assert.ok(specifiers.length > 5);
  for (const s of specifiers) assert.ok(s.startsWith('node:') || s.startsWith('./'), `unexpected import ${s}`);
  for (const file of files(join(ROOT, 'scripts', 'connect', 'lib')).filter((f) => f.endsWith('.mjs'))) {
    const lib = readFileSync(file, 'utf8');
    for (const m of lib.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gms)) {
      assert.ok(m[1].startsWith('node:') || m[1].startsWith('./'), `${file}: unexpected import ${m[1]}`);
    }
  }
});

test('no-ci: the deployment scripts never use a shell', () => {
  for (const file of files(join(ROOT, 'scripts', 'connect')).filter((f) => f.endsWith('.mjs'))) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/\bexecSync\b|\bspawn\(|shell:\s*true/.test(text), file);
  }
});
