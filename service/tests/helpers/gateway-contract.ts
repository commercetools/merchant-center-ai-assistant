/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  QueryLimitError,
  TooLargeError,
} from '../../src/persistence/gateway/errors';
import { ObjectGateway } from '../../src/persistence/gateway/types';
import { HARD_OBJECT_BYTES } from '../../src/persistence/limits';

/**
 * Behaviour every ObjectGateway must have. Run against the in-memory gateway always and
 * against the real one when credentials exist. `prefix` keeps the objects of one run apart.
 */
export function describeGatewayContract(
  name: string,
  makeGateway: () => ObjectGateway,
  opts: { prefix?: string; cleanup?: (containers: string[]) => Promise<void> } = {}
): void {
  describe(`gateway contract: ${name}`, () => {
    const prefix = opts.prefix ?? 'ai-assistant-ct';
    const used = new Set<string>();
    const gw = makeGateway();
    const fresh = (label: string): string => {
      const c = `${prefix}-${label}-${randomUUID().slice(0, 8)}`;
      used.add(c);
      return c;
    };
    afterAll(async () => {
      await opts.cleanup?.([...used]);
    });

    it('returns null for a missing object on get and delete', async () => {
      const c = fresh('missing');
      expect(await gw.get(c, 'nope')).toBeNull();
      expect(await gw.delete(c, 'nope')).toBeNull();
    });

    it('creates, reads, replaces and increments the version', async () => {
      const c = fresh('basic');
      const a = await gw.put(c, 'k', { n: 1 });
      expect(a.version).toBe(1);
      expect(a.value).toEqual({ n: 1 });
      const b = await gw.put(c, 'k', { n: 2 });
      expect(b.version).toBe(2);
      expect(b.createdAt).toBe(a.createdAt);
      expect((await gw.get(c, 'k'))?.value).toEqual({ n: 2 });
    });

    it('throws ConflictError on a stale version and keeps the value', async () => {
      const c = fresh('conflict');
      await gw.put(c, 'k', { n: 1 });
      await gw.put(c, 'k', { n: 2 });
      await expect(gw.put(c, 'k', { n: 3 }, { ifVersion: 1 })).rejects.toBeInstanceOf(
        ConflictError
      );
      expect((await gw.get(c, 'k'))?.value).toEqual({ n: 2 });
      const ok = await gw.put(c, 'k', { n: 3 }, { ifVersion: 2 });
      expect(ok.version).toBe(3);
    });

    it('deletes with a version', async () => {
      const c = fresh('delete');
      await gw.put(c, 'k', { n: 1 });
      await expect(gw.delete(c, 'k', { ifVersion: 9 })).rejects.toBeInstanceOf(ConflictError);
      const gone = await gw.delete(c, 'k', { ifVersion: 1 });
      expect(gone?.key).toBe('k');
      expect(await gw.get(c, 'k')).toBeNull();
    });

    it('drops null members like the real service', async () => {
      const c = fresh('null');
      await gw.put(c, 'k', { a: null, b: 1, nested: { c: null, d: 2 } });
      expect((await gw.get(c, 'k'))?.value).toEqual({ b: 1, nested: { d: 2 } });
    });

    it('filters by value, nested value and key list', async () => {
      const c = fresh('filter');
      await gw.put(c, 'a', { userId: 'u1', featureFlags: { view: 'x' } });
      await gw.put(c, 'b', { userId: 'u2' });
      await gw.put(c, 'c', { userId: 'u1' });
      const byUser = await gw.query(c, {
        filters: [{ kind: 'valueEquals', path: 'userId', value: 'u1' }],
        sort: { field: 'key', dir: 'asc' },
        limit: 10,
      });
      expect(byUser.results.map((o) => o.key)).toEqual(['a', 'c']);
      const nested = await gw.query(c, {
        filters: [{ kind: 'valueEquals', path: 'featureFlags.view', value: 'x' }],
        limit: 10,
      });
      expect(nested.results.map((o) => o.key)).toEqual(['a']);
      const keys = await gw.query(c, {
        filters: [{ kind: 'keyIn', keys: ['a', 'b', 'zzz'] }],
        sort: { field: 'key', dir: 'asc' },
        limit: 10,
      });
      expect(keys.results.map((o) => o.key)).toEqual(['a', 'b']);
    });

    it('treats hostile filter text as data', async () => {
      const c = fresh('hostile');
      await gw.put(c, 'a', { userId: 'x" or 1=1 or "' });
      await gw.put(c, 'b', { userId: 'other' });
      const r = await gw.query(c, {
        filters: [{ kind: 'valueEquals', path: 'userId', value: 'x" or 1=1 or "' }],
        limit: 10,
      });
      expect(r.results.map((o) => o.key)).toEqual(['a']);
    });

    it('sorts, pages and totals', async () => {
      const c = fresh('page');
      for (const k of ['k1', 'k2', 'k3', 'k4', 'k5']) await gw.put(c, k, { n: k });
      const asc = await gw.query(c, {
        sort: { field: 'createdAt', dir: 'asc' },
        limit: 2,
        offset: 1,
        withTotal: true,
      });
      expect(asc.results.map((o) => o.key)).toEqual(['k2', 'k3']);
      expect(asc.total).toBe(5);
      const desc = await gw.query(c, { sort: { field: 'createdAt', dir: 'desc' }, limit: 2 });
      expect(desc.results.map((o) => o.key)).toEqual(['k5', 'k4']);
      const byKey = await gw.query(c, { sort: { field: 'key', dir: 'desc' }, limit: 1 });
      expect(byKey.results[0].key).toBe('k5');
    });

    it('filters by time and orders by lastModifiedAt', async () => {
      const c = fresh('time');
      const first = await gw.put(c, 'a', { n: 1 });
      await new Promise((r) => setTimeout(r, 5));
      await gw.put(c, 'b', { n: 2 });
      const after = await gw.query(c, {
        filters: [{ kind: 'time', field: 'createdAt', op: '>', iso: first.createdAt }],
        limit: 10,
      });
      expect(after.results.map((o) => o.key)).toEqual(['b']);
      await new Promise((r) => setTimeout(r, 5));
      await gw.put(c, 'a', { n: 3 });
      const recent = await gw.query(c, { sort: { field: 'lastModifiedAt', dir: 'desc' }, limit: 5 });
      expect(recent.results.map((o) => o.key)).toEqual(['a', 'b']);
    });

    it('refuses bad queries before any request', async () => {
      const c = fresh('badquery');
      await expect(gw.query(c, { limit: 501 })).rejects.toBeInstanceOf(QueryLimitError);
      await expect(gw.query(c, { limit: 1, offset: 10001 })).rejects.toBeInstanceOf(
        QueryLimitError
      );
      await expect(
        gw.query(c, { limit: 1, sort: { field: 'value.title' as never, dir: 'asc' } })
      ).rejects.toBeInstanceOf(QueryLimitError);
    });

    it('refuses an oversized value', async () => {
      const c = fresh('big');
      await expect(
        gw.put(c, 'k', { blob: 'x'.repeat(HARD_OBJECT_BYTES + 1) })
      ).rejects.toBeInstanceOf(TooLargeError);
      expect(await gw.get(c, 'k')).toBeNull();
    });
  });
}
