/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The prompt lists Nimbus components from the generated surface manifest, and the model reads
 * the docs served by `@commercetools/nimbus-mcp`: both must be the same Nimbus release.
 * The service's own manifest copy next to the page-generation prompt is the first candidate;
 * the frontend copy generated in `mc-app` is the fallback when it is absent.
 */
const MANIFEST_CANDIDATES = [
  'src/composed-pages/prompt/nimbus-surface.generated.ts',
  '../mc-app/src/utils/nimbus-surface.generated.ts',
].map((p) => path.resolve(process.cwd(), p));

const manifest = MANIFEST_CANDIDATES.find((p) => existsSync(p));

const pin = (
  JSON.parse(readFileSync('package.json', 'utf8')) as {
    dependencies: Record<string, string>;
  }
).dependencies['@commercetools/nimbus-mcp'];

describe('@commercetools/nimbus-mcp pin', () => {
  test('is an exact version (no range)', () => {
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('is the installed version', () => {
    const installed = (
      JSON.parse(
        readFileSync(
          'node_modules/@commercetools/nimbus-mcp/package.json',
          'utf8'
        )
      ) as { version: string }
    ).version;
    expect(installed).toBe(pin);
  });

  test("prefers the service's own manifest over the mc-app fallback", () => {
    expect(manifest).toBe(MANIFEST_CANDIDATES[0]);
  });

  if (!manifest) {
    test.todo(
      'equals NIMBUS_VERSION of the surface manifest (no manifest found)'
    );
  } else {
    test('equals NIMBUS_VERSION of the surface manifest', () => {
      const match = /NIMBUS_VERSION\s*=\s*'([^']+)'/.exec(
        readFileSync(manifest, 'utf8')
      );
      // Both versions are in the failure message.
      expect({ 'service/package.json': pin, manifest: match?.[1] }).toEqual({
        'service/package.json': match?.[1],
        manifest: match?.[1],
      });
    });
  }
});
