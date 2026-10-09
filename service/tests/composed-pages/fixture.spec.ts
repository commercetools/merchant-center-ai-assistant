/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  COMPOSED_PAGES_CONTAINER_KEY,
  decodeCode,
  isUsableTranspiledCode,
} from '../../src/composed-pages/contract';
import { buildComposedPageFixtureJson } from '../../src/composed-pages/fixture';

const FIXTURE = join(process.cwd(), '../contract/composed-page.fixture.json');

describe('shared composed page fixture', () => {
  it('matches what the tool produces now (no drift)', async () => {
    const expected = await buildComposedPageFixtureJson();
    const actual = readFileSync(FIXTURE, 'utf8');
    if (actual !== expected) {
      throw new Error(
        'contract/composed-page.fixture.json is stale. Regenerate it with: cd service && npm run update:composed-page-fixture'
      );
    }
  });

  it('holds a hooks component and a pure component, both usable', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
      containerKey: string;
      storedValue: {
        schema: {
          components: {
            name: string;
            code: { text: string; transpiledCode: string };
          }[];
        };
      };
    };
    expect(fixture.containerKey).toBe(COMPOSED_PAGES_CONTAINER_KEY);
    const [hooks, pure] = fixture.storedValue.schema.components;
    expect(decodeCode(hooks.code.text)).toContain('useState');
    expect(decodeCode(pure.code.text)).toMatch(/^return <Text>/);
    for (const component of [hooks, pure]) {
      expect(
        isUsableTranspiledCode(
          decodeCode(component.code.transpiledCode),
          component.name
        )
      ).toBe(true);
    }
  });

  it('contains no timestamps or random ids', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
