/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  DATA_SOURCE_TARGETS,
  parseComposedPageInput,
} from '../../src/composed-pages/schema';

const component = (name = 'Main', extra: Record<string, unknown> = {}) => ({
  name,
  componentBody: 'return null;',
  ...extra,
});
const page = (components: unknown[], extra: Record<string, unknown> = {}) => ({
  title: 'T',
  components,
  ...extra,
});

describe('composed page input schema', () => {
  it('accepts a minimal page', () => {
    expect(parseComposedPageInput(page([component()])).success).toBe(true);
  });

  it('rejects a lowercase component name at components[0].name', () => {
    const result = parseComposedPageInput(page([component('statsCard')]));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].path).toBe('components[0].name');
      expect(result.errors[0].message).toMatch(/PascalCase/);
    }
  });

  it('rejects 21 components naming the limit of 20', () => {
    const many = Array.from({ length: 21 }, (_, i) => component(`C${i}`));
    const result = parseComposedPageInput(page(many));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.errors.map((e) => e.message).join()).toMatch(/20/);
  });

  it('rejects duplicate names', () => {
    const result = parseComposedPageInput(
      page([component('A'), component('A')])
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.errors[0].path).toBe('components[1].name');
  });

  it('rejects a bad data source target and too many sources', () => {
    const source = (id: string, target?: string) => ({
      id,
      name: id,
      query: '{ a }',
      target,
    });
    const bad = parseComposedPageInput(
      page([component('A', { dataSources: [source('x', 'BIG_QUERY')] })])
    );
    expect(bad.success).toBe(false);
    const tooMany = parseComposedPageInput(
      page([
        component('A', {
          dataSources: Array.from({ length: 11 }, (_, i) => source(`s${i}`)),
        }),
      ])
    );
    expect(tooMany.success).toBe(false);
    expect(DATA_SOURCE_TARGETS).toEqual(['COMMERCETOOLS_PLATFORM']);
  });

  it('caps the body length', () => {
    const result = parseComposedPageInput(
      page([component('A', { componentBody: 'x'.repeat(20_001) })])
    );
    expect(result.success).toBe(false);
  });

  it('validates key and previousVersion', () => {
    expect(
      parseComposedPageInput(page([component()], { key: 'orders-1' })).success
    ).toBe(true);
    expect(
      parseComposedPageInput(
        page([component()], {
          key: '3f2b8c1e-0000-4000-8000-000000000000',
          previousVersion: 2,
        })
      ).success
    ).toBe(true);
    expect(
      parseComposedPageInput(page([component()], { key: 'Bad Key' })).success
    ).toBe(false);
    expect(
      parseComposedPageInput(page([component()], { previousVersion: 0 }))
        .success
    ).toBe(false);
  });
});
