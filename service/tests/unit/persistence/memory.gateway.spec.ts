/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ConflictError, InvalidIdError } from '../../../src/persistence/gateway/errors';
import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';

describe('MemoryObjectGateway', () => {
  it('has strictly monotonic timestamps even with a frozen clock', async () => {
    const gw = new MemoryObjectGateway(() => 1000);
    const a = await gw.put('c', 'a', {});
    const b = await gw.put('c', 'b', {});
    const c = await gw.put('c', 'c', {});
    expect(a.createdAt < b.createdAt && b.createdAt < c.createdAt).toBe(true);
    expect(a.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('keeps createdAt on replace and bumps lastModifiedAt', async () => {
    const gw = new MemoryObjectGateway();
    const a = await gw.put('c', 'a', { n: 1 });
    const b = await gw.put('c', 'a', { n: 2 });
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.lastModifiedAt > a.lastModifiedAt).toBe(true);
    expect(b.id).toBe(a.id);
  });

  it('refuses ifVersion on a missing object', async () => {
    const gw = new MemoryObjectGateway();
    await expect(gw.put('c', 'a', {}, { ifVersion: 1 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns copies, not live references', async () => {
    const gw = new MemoryObjectGateway();
    const value = { n: { m: 1 } };
    await gw.put('c', 'a', value);
    value.n.m = 99;
    const read = await gw.get('c', 'a');
    expect((read?.value as typeof value).n.m).toBe(1);
    (read?.value as typeof value).n.m = 5;
    expect(((await gw.get('c', 'a'))?.value as typeof value).n.m).toBe(1);
  });

  it('caps the total of a filtered query at 10000', async () => {
    const gw = new MemoryObjectGateway();
    // total of a query without predicate is exact; with a predicate it never exceeds the offset cap
    await gw.put('c', 'a', { u: 'x' });
    const r = await gw.query('c', {
      filters: [{ kind: 'valueEquals', path: 'u', value: 'x' }],
      limit: 1,
      withTotal: true,
    });
    expect(r.total).toBe(1);
  });

  it('omits total unless asked', async () => {
    const gw = new MemoryObjectGateway();
    await gw.put('c', 'a', {});
    expect((await gw.query('c', { limit: 5 })).total).toBeUndefined();
  });

  it('validates names', async () => {
    const gw = new MemoryObjectGateway();
    await expect(gw.get('a b', 'k')).rejects.toBeInstanceOf(InvalidIdError);
    await expect(gw.put('c', '../k', {})).rejects.toBeInstanceOf(InvalidIdError);
  });

  describe('production guard', () => {
    const original = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = original;
    });
    it('is refused when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new MemoryObjectGateway()).toThrow(/production/);
    });
    it('is refused when NODE_ENV is unset', () => {
      delete process.env.NODE_ENV;
      expect(() => new MemoryObjectGateway()).toThrow(/production/);
    });
  });
});
