/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { TGraphQLVariable } from '../types/composed-page';
import {
  cleanQuery,
  resolveVariables,
  unsupportedTarget,
} from './data-sources-context';

const context = {
  projectKey: 'my-project',
  dataLocale: 'de-DE',
  userId: 'user-1',
  urlParams: { orderId: 'order-42' },
};

const variable = (v: Partial<TGraphQLVariable>): TGraphQLVariable => ({
  name: 'x',
  type: 'string',
  ...v,
});

describe('resolveVariables', () => {
  it('returns an empty object without variables', () => {
    expect(resolveVariables(undefined, context)).toEqual({});
    expect(resolveVariables([], context)).toEqual({});
  });

  it('uses literal values', () => {
    expect(resolveVariables([variable({ value: 'abc' })], context)).toEqual({
      x: 'abc',
    });
  });

  it.each([
    ['projectKey', 'my-project'],
    ['dataLocale', 'de-DE'],
    ['userId', 'user-1'],
  ] as const)('resolves fromContext %s', (key, expected) => {
    expect(resolveVariables([variable({ fromContext: key })], context)).toEqual(
      { x: expected }
    );
  });

  it('binds fromUrl route params with and without the colon', () => {
    expect(
      resolveVariables([variable({ fromUrl: ':orderId' })], context)
    ).toEqual({ x: 'order-42' });
    expect(
      resolveVariables([variable({ fromUrl: 'orderId' })], context)
    ).toEqual({ x: 'order-42' });
  });

  it('converts types', () => {
    expect(
      resolveVariables([variable({ type: 'number', value: '5' })], context)
    ).toEqual({ x: 5 });
    expect(
      resolveVariables([variable({ type: 'boolean', value: 1 })], context)
    ).toEqual({ x: true });
    expect(
      resolveVariables([variable({ type: 'array', value: 'a' })], context)
    ).toEqual({ x: ['a'] });
    expect(
      resolveVariables(
        [variable({ type: 'array', value: ['a', 'b'] })],
        context
      )
    ).toEqual({ x: ['a', 'b'] });
    expect(
      resolveVariables([variable({ type: 'string', value: 7 })], context)
    ).toEqual({ x: '7' });
  });

  it('keeps undefined undefined instead of the string "undefined"', () => {
    expect(
      resolveVariables([variable({ fromUrl: ':missing' })], context)
    ).toEqual({ x: undefined });
    expect(
      resolveVariables([variable({ fromContext: 'userId' })], {
        projectKey: 'p',
      })
    ).toEqual({ x: undefined });
  });
});

describe('cleanQuery', () => {
  it('returns a trimmed query', () => {
    expect(cleanQuery('  query { a }  ')).toBe(cleanQuery('query { a }'));
  });
});

describe('unsupportedTarget', () => {
  it('reports a target other than COMMERCETOOLS_PLATFORM', () => {
    const error = unsupportedTarget({ id: 'sales', target: 'BIG_QUERY' });
    expect(error?.message).toContain('Unsupported data source target');
    expect(error?.message).toContain('"sales"');
  });

  it('accepts COMMERCETOOLS_PLATFORM and a missing target', () => {
    expect(
      unsupportedTarget({ id: 'a', target: 'COMMERCETOOLS_PLATFORM' })
    ).toBeUndefined();
    expect(unsupportedTarget({ id: 'a' })).toBeUndefined();
  });
});
