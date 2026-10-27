/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { QueryLimitError } from '../../../src/persistence/gateway/errors';
import { compileQuery } from '../../../src/persistence/gateway/query';
import { ObjectQuery } from '../../../src/persistence/gateway/types';

const q = (extra: Partial<ObjectQuery> = {}): ObjectQuery => ({ limit: 10, ...extra });

describe('compileQuery', () => {
  it('compiles a flat value filter with an input variable', () => {
    const c = compileQuery(q({ filters: [{ kind: 'valueEquals', path: 'userId', value: 'u1' }] }));
    expect(c.where).toEqual(['value(userId = :v0)']);
    expect(c.vars).toEqual({ v0: 'u1' });
  });

  it('compiles nested paths', () => {
    const c = compileQuery(
      q({ filters: [{ kind: 'valueEquals', path: 'featureFlags.customView', value: 'x' }] })
    );
    expect(c.where).toEqual(['value(featureFlags(customView = :v0))']);
  });

  it('keeps hostile text out of the predicate', () => {
    const hostile = 'x" or 1=1 or "';
    const c = compileQuery(q({ filters: [{ kind: 'valueEquals', path: 'userId', value: hostile }] }));
    expect(c.where.join(' ')).not.toContain('1=1');
    expect(c.vars.v0).toBe(hostile);
  });

  it('writes booleans and numbers inline after validation', () => {
    const c = compileQuery(
      q({
        filters: [
          { kind: 'valueEquals', path: 'flag', value: true },
          { kind: 'valueEquals', path: 'n', value: 3 },
        ],
      })
    );
    expect(c.where).toEqual(['value(flag = true)', 'value(n = 3)']);
    expect(c.vars).toEqual({});
    expect(() =>
      compileQuery(q({ filters: [{ kind: 'valueEquals', path: 'n', value: Infinity }] }))
    ).toThrow(QueryLimitError);
  });

  it('compiles keyIn with a repeated variable', () => {
    const c = compileQuery(q({ filters: [{ kind: 'keyIn', keys: ['a', 'b'] }] }));
    expect(c.where).toEqual(['key in :k0']);
    expect(c.vars).toEqual({ k0: ['a', 'b'] });
  });

  it('compiles a time filter and sort', () => {
    const c = compileQuery(
      q({
        filters: [{ kind: 'time', field: 'createdAt', op: '>', iso: '2026-01-01T00:00:00.000Z' }],
        sort: { field: 'lastModifiedAt', dir: 'desc' },
        withTotal: true,
        offset: 20,
      })
    );
    expect(c.where).toEqual(['createdAt > "2026-01-01T00:00:00.000Z"']);
    expect(c.sort).toEqual(['lastModifiedAt desc']);
    expect(c.withTotal).toBe(true);
    expect(c.offset).toBe(20);
  });

  it('rejects bad input before any request', () => {
    const bad: ObjectQuery[] = [
      q({ filters: [{ kind: 'valueEquals', path: 'a b', value: 'x' }] }),
      q({ filters: [{ kind: 'valueEquals', path: 'a)or(b', value: 'x' }] }),
      q({ filters: [{ kind: 'valueEquals', path: '1a', value: 'x' }] }),
      q({ filters: [{ kind: 'time', field: 'createdAt', op: '>', iso: '2026-01-01" or 1=1' }] }),
      q({ filters: [{ kind: 'time', field: 'createdAt', op: '>', iso: 'tomorrow' }] }),
      q({ filters: [{ kind: 'keyIn', keys: Array.from({ length: 51 }, (_, i) => `k${i}`) }] }),
      q({ filters: [{ kind: 'keyIn', keys: [] }] }),
      { limit: 0 },
      { limit: 501 },
      { limit: 10, offset: 10001 },
      { limit: 10, offset: -1 },
      q({ sort: { field: 'value.title' as never, dir: 'asc' } }),
    ];
    for (const query of bad) {
      expect(() => compileQuery(query)).toThrow(QueryLimitError);
    }
  });

  it('accepts the boundaries', () => {
    expect(() => compileQuery({ limit: 500, offset: 10000 })).not.toThrow();
    expect(() =>
      compileQuery(q({ filters: [{ kind: 'keyIn', keys: Array.from({ length: 50 }, (_, i) => `k${i}`) }] }))
    ).not.toThrow();
  });
});
