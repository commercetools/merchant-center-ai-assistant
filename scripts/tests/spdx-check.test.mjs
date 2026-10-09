/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHeader, checkName, isGenerated } from '../spdx-check.mjs';

const BANNER = `/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
`;

test('header: accepts block comment after shebang', () => {
  assert.equal(checkHeader(`#!/usr/bin/env node\n${BANNER}export {};\n`), true);
});

test('header: rejects missing SPDX', () => {
  assert.equal(checkHeader('export const a = 1;\n'), false);
});

test('header: rejects header without UNSUPPORTED line', () => {
  const text = '// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors\n';
  assert.equal(checkHeader(text), false);
});

test('generated: public/ and lock files are exempt', () => {
  assert.equal(isGenerated('mc-app/public/app.js'), true);
  assert.equal(isGenerated('service/package-lock.json'), true);
  assert.equal(isGenerated('mc-app/src/index.ts'), false);
});

test('names: accepts scoped and unscoped', () => {
  assert.deepEqual(checkName({ name: 'ai-assistant-service', private: true }), []);
  assert.deepEqual(checkName({ name: '@commercetools-labs/ai-assistant-mc-app', private: true }), []);
});

test('names: rejects foreign scope', () => {
  assert.equal(checkName({ name: '@other/ai-assistant-service', private: true }).length, 1);
});

test('names: rejects service-typescript', () => {
  const problems = checkName({ name: 'service-typescript', private: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /expected ai-assistant-<suffix>/);
});
