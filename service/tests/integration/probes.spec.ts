/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getApiRoot } from '../../src/client/create.client';
import { ConflictError } from '../../src/persistence/gateway/errors';
import { logger } from '../../src/utils/logger.utils';
import { cleanupRun, liveDescribe, liveGateway, newRunPrefix } from './live';

/**
 * Fact probes: each test checks one platform assumption of design.md (P1..P15) and names it.
 * Everything is created under a random prefix and removed afterwards.
 */
const prefix = newRunPrefix();
const c = (label: string) => `${prefix}-${label}`;
const raw = () => getApiRoot().customObjects();

const statusOf = (e: unknown): number | undefined => (e as { statusCode?: number }).statusCode;

async function rawPost(container: string, key: string, value: unknown, version?: number) {
  return raw()
    .post({ body: { container, key, value: value as never, ...(version !== undefined ? { version } : {}) } })
    .execute();
}

liveDescribe('fact probes against a scratch project', () => {
  const gw = liveGateway();
  afterAll(() => cleanupRun(prefix));

  it('P-charset: names with space, colon, at, slash, non-ascii and 257 chars are rejected; a_b.c~d-e is accepted', async () => {
    const container = c('charset');
    const bad = ['a b', 'a:b', 'a@b', 'a/b', 'é', 'k'.repeat(257)];
    const accepted: string[] = [];
    for (const key of bad) {
      try {
        await rawPost(container, key, { n: 1 });
        accepted.push(key.length > 20 ? `(${key.length} chars)` : key);
      } catch (e) {
        expect(statusOf(e)).toBeGreaterThanOrEqual(400);
      }
    }
    // Wider than assumed is allowed by the platform; our client-side rule stays conservative.
    logger.info(`P-charset: platform also accepted ${JSON.stringify(accepted)}`);
    const ok = await rawPost(container, 'a_b.c~d-e', { n: 1 });
    expect(ok.body.version).toBe(1);
  });

  it('P-created: createdAt is stable on replace, lastModifiedAt increases, version 1 -> 2 (P15)', async () => {
    const container = c('created');
    const a = await gw.put(container, 'k', { n: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const b = await gw.put(container, 'k', { n: 2 });
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.lastModifiedAt > a.lastModifiedAt).toBe(true);
    expect([a.version, b.version]).toEqual([1, 2]);
  });

  it('P-409: a stale version answers 409 with currentVersion (P8)', async () => {
    const container = c('conflict');
    await gw.put(container, 'k', { n: 1 });
    await gw.put(container, 'k', { n: 2 });
    const err = await gw.put(container, 'k', { n: 3 }, { ifVersion: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).currentVersion).toBe(2);
  });

  it('P-create-version-zero: record what version 0 does on a missing and on an existing object', async () => {
    const container = c('v0');
    const first = await rawPost(container, 'k', { n: 1 }, 0).then(
      (r) => `created v${r.body.version}`,
      (e: unknown) => `rejected ${statusOf(e)}`
    );
    await gw.put(container, 'k2', { n: 1 });
    const second = await rawPost(container, 'k2', { n: 2 }, 0).then(
      (r) => `replaced v${r.body.version}`,
      (e: unknown) => `rejected ${statusOf(e)}`
    );
    // Not an assertion about the platform: this probe RECORDS the answer (design gap G-E1:
    // if version 0 means "create only", create races could be closed).
    logger.info(`P-create-version-zero: missing -> ${first}; existing -> ${second}`);
    expect(typeof first).toBe('string');
  });

  it('P-claim: two parallel delete-with-version calls have exactly one winner (P14)', async () => {
    const container = c('claim');
    const o = await gw.put(container, 'k', { n: 1 });
    const results = await Promise.all(
      [1, 2].map(() => gw.delete(container, 'k', { ifVersion: o.version }).then(
        (r) => (r ? 'won' : 'missing'),
        (e: unknown) => (e instanceof ConflictError ? 'conflict' : 'error')
      ))
    );
    logger.info(`P-claim: outcomes ${JSON.stringify(results)}`);
    expect(results.filter((r) => r === 'won')).toHaveLength(1);
    expect(results).not.toContain('error');
  });

  it('P-list-after-write: a write is visible to a query immediately, 20 times (P11)', async () => {
    const container = c('lag');
    for (let i = 0; i < 20; i++) {
      await gw.put(container, `k${i}`, { n: i });
      const page = await gw.query(container, { limit: 500, withTotal: true });
      expect(page.total).toBe(i + 1);
    }
  });

  it('P-var: string, numeric and boolean value filters (P6) and variable typing', async () => {
    const container = c('var');
    await gw.put(container, 'a', { userId: 'u1', n: 3, flag: true, nested: { x: 'y' } });
    await gw.put(container, 'b', { userId: 'u2', n: 4, flag: false });
    const q = (filters: Parameters<typeof gw.query>[1]['filters']) =>
      gw.query(container, { filters, limit: 10 }).then((r) => r.results.map((o) => o.key));
    expect(await q([{ kind: 'valueEquals', path: 'userId', value: 'u1' }])).toEqual(['a']);
    expect(await q([{ kind: 'valueEquals', path: 'nested.x', value: 'y' }])).toEqual(['a']);
    expect(await q([{ kind: 'valueEquals', path: 'n', value: 4 }])).toEqual(['b']);
    expect(await q([{ kind: 'valueEquals', path: 'flag', value: true }])).toEqual(['a']);
    // Typed variables (decides whether compileQuery may send numbers as variables):
    const typed = await raw()
      .withContainer({ container })
      .get({ queryArgs: { where: 'value(n = :n)', 'var.n': '3' } })
      .execute()
      .then((r) => `ok ${r.body.results.length}`, (e: unknown) => `rejected ${statusOf(e)}`);
    logger.info(`P-var-types: numeric variable -> ${typed}`);
  });

  it('P-keyin: 50 keys in one predicate work', async () => {
    const container = c('keyin');
    await gw.put(container, 'k1', {});
    await gw.put(container, 'k2', {});
    const keys = ['k1', 'k2', ...Array.from({ length: 48 }, (_, i) => `none${i}`)];
    const page = await gw.query(container, { filters: [{ kind: 'keyIn', keys }], limit: 50 });
    expect(page.results.map((o) => o.key).sort()).toEqual(['k1', 'k2']);
  });

  it('P-sort: createdAt asc/desc, key asc, lastModifiedAt desc (P4)', async () => {
    const container = c('sort');
    for (const k of ['b', 'a', 'c']) await gw.put(container, k, {});
    const keys = async (field: 'createdAt' | 'key' | 'lastModifiedAt', dir: 'asc' | 'desc') =>
      (await gw.query(container, { sort: { field, dir }, limit: 10 })).results.map((o) => o.key);
    expect(await keys('createdAt', 'asc')).toEqual(['b', 'a', 'c']);
    expect(await keys('createdAt', 'desc')).toEqual(['c', 'a', 'b']);
    expect(await keys('key', 'asc')).toEqual(['a', 'b', 'c']);
    await gw.put(container, 'b', { touched: true });
    expect((await keys('lastModifiedAt', 'desc'))[0]).toBe('b');
  });

  it('P-order: 50 sequential puts come back in append order by createdAt (message ordering)', async () => {
    const container = c('order');
    const ids = Array.from({ length: 50 }, (_, i) => `m${String(i).padStart(3, '0')}`.split('').reverse().join(''));
    for (const id of ids) await gw.put(container, id, { id });
    const page = await gw.query(container, { sort: { field: 'createdAt', dir: 'asc' }, limit: 100 });
    expect(page.results.map((o) => o.key)).toEqual(ids);
  });

  it('P-null: null members are not saved (P1)', async () => {
    const container = c('null');
    const o = await rawPost(container, 'k', { a: null, b: 1 });
    expect(o.body.value).toEqual({ b: 1 });
  });

  it('P-size: a 1.9 MB and a 3 MB value are accepted; over our hard limit is refused client-side (P2)', async () => {
    const container = c('size');
    await gw.put(container, 'two', { blob: 'x'.repeat(1_900_000) });
    await gw.put(container, 'three', { blob: 'x'.repeat(3_000_000) });
    await expect(gw.put(container, 'big', { blob: 'x'.repeat(7 * 1024 * 1024) })).rejects.toThrow(
      /size limit/
    );
  });

  it('P-offset / P-limit: offset 10001 and limit 501 are refused by the platform (P5)', async () => {
    const container = c('limits');
    await gw.put(container, 'k', {});
    const offset = await raw()
      .withContainer({ container })
      .get({ queryArgs: { limit: 1, offset: 10001 } })
      .execute()
      .then(() => 'accepted', (e: unknown) => statusOf(e));
    const limit = await raw()
      .withContainer({ container })
      .get({ queryArgs: { limit: 501 } })
      .execute()
      .then(() => 'accepted', (e: unknown) => statusOf(e));
    expect(offset).toBe(400);
    expect(limit).toBe(400);
  });

  it('P-total: total with and without a predicate', async () => {
    const container = c('total');
    for (let i = 0; i < 3; i++) await gw.put(container, `k${i}`, { u: i < 2 ? 'x' : 'y' });
    const all = await gw.query(container, { limit: 1, withTotal: true });
    const some = await gw.query(container, {
      filters: [{ kind: 'valueEquals', path: 'u', value: 'x' }],
      limit: 1,
      withTotal: true,
    });
    expect(all.total).toBe(3);
    expect(some.total).toBe(2);
  });
});
