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

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-versions.mjs');
const APPS = ['mc-app', 'composed-apps', 'mc-view-app'];

function baseDeps() {
  return {
    '@commercetools-frontend/application-shell': '27.9.6',
    '@commercetools/nimbus': '3.6.0',
    '@tabler/icons': '^3.35.0',
    '@babel/core': '^7.28.6',
    jest: '29.7.0',
  };
}

function run(mutate = () => {}, servicePin = '3.6.0') {
  const root = mkdtempSync(join(tmpdir(), 'check-versions-'));
  try {
    const manifests = Object.fromEntries(APPS.map((app) => [app, { dependencies: baseDeps() }]));
    mutate(manifests);
    for (const app of APPS) {
      mkdirSync(join(root, app), { recursive: true });
      writeFileSync(join(root, app, 'package.json'), JSON.stringify(manifests[app]));
    }
    mkdirSync(join(root, 'service'), { recursive: true });
    writeFileSync(
      join(root, 'service', 'package.json'),
      JSON.stringify({ dependencies: { '@commercetools/nimbus-mcp': servicePin } })
    );
    const result = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, CHECK_ROOT: root },
      encoding: 'utf8',
    });
    return { code: result.status, out: result.stdout };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('check-versions: aligned manifests pass', () => {
  const result = run();
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /OK 27\.9\.6; nimbus 3\.6\.0/);
});

test('check-versions: frontend package drift fails', () => {
  const result = run((m) => {
    m['mc-view-app'].dependencies['@commercetools-frontend/application-shell'] = '27.9.7';
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /DRIFT: 2 distinct @commercetools-frontend/);
});

test('check-versions: a caret nimbus range fails', () => {
  const result = run((m) => {
    m['mc-app'].dependencies['@commercetools/nimbus'] = '^3.6.0';
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /mc-app\/package\.json @commercetools\/nimbus \^3\.6\.0 is not an exact pin/);
});

test('check-versions: nimbus that differs from the nimbus-mcp pin fails', () => {
  const result = run(() => {}, '3.7.0');
  assert.equal(result.code, 1);
  assert.match(result.out, /differs from service\/package\.json @commercetools\/nimbus-mcp 3\.7\.0/);
});

test('check-versions: jest drift fails', () => {
  const result = run((m) => {
    m['composed-apps'].dependencies.jest = '30.0.0';
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /DRIFT: jest differs/);
});

test('check-versions: @tabler/icons range drift fails', () => {
  const result = run((m) => {
    m['composed-apps'].dependencies['@tabler/icons'] = '^3.36.0';
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /DRIFT: @tabler\/icons differs/);
});

test('check-versions: @babel/core minor differences pass but a major difference fails', () => {
  const minor = run((m) => {
    m['composed-apps'].dependencies['@babel/core'] = '^7.29.0';
  });
  assert.equal(minor.code, 0, minor.out);
  const major = run((m) => {
    m['composed-apps'].dependencies['@babel/core'] = '^8.0.0';
  });
  assert.equal(major.code, 1);
  assert.match(major.out, /DRIFT: @babel\/core differs/);
});
