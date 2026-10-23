/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isResolveError, resolveNimbusMcp } from '../../src/nimbus/resolve';

describe('resolveNimbusMcp', () => {
  test('finds the installed package and reports the pinned version', () => {
    const found = resolveNimbusMcp(process.cwd());
    if (isResolveError(found)) throw new Error(found.error);
    const pin = (
      JSON.parse(readFileSync('package.json', 'utf8')) as {
        dependencies: Record<string, string>;
      }
    ).dependencies['@commercetools/nimbus-mcp'];
    expect(found.version).toBe(pin);
    expect(found.entry.endsWith(path.join('dist', 'index.js'))).toBe(true);
  });

  test('returns an error object, not an exception, when the package is missing', () => {
    // A temp dir has no node_modules above it that contains the package.
    const dir = mkdtempSync(path.join(tmpdir(), 'no-nimbus-'));
    const result = resolveNimbusMcp(dir);
    // __dirname does not exist in Jest ESM mode, so no second chance finds the real package.
    expect(isResolveError(result)).toBe(true);
    if (isResolveError(result)) expect(result.error).toMatch(/nimbus-mcp/);
  });
});
