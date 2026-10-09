/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-frontend-leftovers.mjs');

// Words are built with concatenation so this file does not match the scan it tests.
const TENANT = ['ten', 'ant'].join('');
const NGROK = ['ng', 'rok'].join('');
const CONSOLE = ['console', '.log("x")'].join('');

function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-leftovers-'));
  try {
    for (const [file, content] of Object.entries(files)) {
      const target = join(root, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const result = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, CHECK_ROOT: root },
      encoding: 'utf8',
    });
    return { code: result.status, out: result.stdout };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('check-frontend-leftovers: a clean tree passes', () => {
  const result = run({ 'mc-app/src/index.ts': 'export const a = 1;\n' });
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /OK no frontend leftovers/);
});

test('check-frontend-leftovers: a multitenant word is reported with file and line', () => {
  const result = run({ 'composed-apps/src/a.ts': `const a = 1;\n// the ${TENANT} id\n` });
  assert.equal(result.code, 1);
  assert.match(result.out, /composed-apps\/src\/a\.ts:2:/);
  assert.match(result.out, /1 leftover match/);
});

test('check-frontend-leftovers: tunnel hosts and console calls are reported', () => {
  const result = run({
    'mc-view-app/src/a.ts': `const url = 'https://x.${NGROK}.app';\n`,
    'mc-app/src/b.ts': `${CONSOLE};\n`,
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /2 leftover match/);
});

test('check-frontend-leftovers: markdown, lock files, node_modules and public are skipped', () => {
  const result = run({
    'mc-app/README.md': `${TENANT}\n`,
    'mc-app/yarn.lock': `${TENANT}\n`,
    'mc-app/node_modules/x/index.js': `${TENANT}\n`,
    'mc-app/public/a.js': `${TENANT}\n`,
    'mc-app/src/ok.ts': 'export {};\n',
  });
  assert.equal(result.code, 0, result.out);
});

test('check-frontend-leftovers: directories outside the three apps are not scanned', () => {
  const result = run({ 'service/src/a.ts': `${TENANT}\n` });
  assert.equal(result.code, 0, result.out);
});
