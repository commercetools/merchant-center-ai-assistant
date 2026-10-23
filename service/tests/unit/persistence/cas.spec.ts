/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { SKIP, updateWithRetry } from '../../../src/persistence/gateway/cas';
import { ConflictError } from '../../../src/persistence/gateway/errors';
import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';
import { ObjectGateway } from '../../../src/persistence/gateway/types';

type V = { a?: number; b?: number };
const noSleep = { sleep: async () => undefined };

describe('updateWithRetry', () => {
  it('creates when absent', async () => {
    const gw = new MemoryObjectGateway();
    const r = await updateWithRetry<V>(gw, 'c', 'k', (cur) => ({ ...(cur ?? {}), a: 1 }), noSleep);
    expect(r.written).toBe(true);
    expect((await gw.get('c', 'k'))?.value).toEqual({ a: 1 });
  });

  it('lets two interleaved updaters both land', async () => {
    const gw = new MemoryObjectGateway();
    await gw.put('c', 'k', {});
    await Promise.all([
      updateWithRetry<V>(gw, 'c', 'k', (cur) => ({ ...cur, a: 1 }), noSleep),
      updateWithRetry<V>(gw, 'c', 'k', (cur) => ({ ...cur, b: 2 }), noSleep),
    ]);
    expect((await gw.get('c', 'k'))?.value).toEqual({ a: 1, b: 2 });
  });

  it('re-applies a pure mutate after a conflict', async () => {
    const gw = new MemoryObjectGateway();
    await gw.put('c', 'k', { a: 1 });
    let runs = 0;
    const racing: ObjectGateway = {
      get: (c, k) => gw.get(c, k),
      delete: (c, k, o) => gw.delete(c, k, o),
      query: (c, q) => gw.query(c, q),
      async put(c, k, v, o) {
        // someone else writes between our read and our write, once
        if (runs === 1) await gw.put(c, k, { a: 10 });
        return gw.put(c, k, v, o);
      },
    };
    const r = await updateWithRetry<V>(
      racing,
      'c',
      'k',
      (cur) => {
        runs += 1;
        return { a: (cur?.a ?? 0) + 1 };
      },
      noSleep
    );
    expect(runs).toBe(2);
    expect(r.value).toEqual({ a: 11 });
  });

  it('throws ConflictError after 5 consecutive conflicts', async () => {
    const gw = new MemoryObjectGateway();
    await gw.put('c', 'k', {});
    let puts = 0;
    const always: ObjectGateway = {
      get: (c, k) => gw.get(c, k),
      delete: (c, k, o) => gw.delete(c, k, o),
      query: (c, q) => gw.query(c, q),
      async put() {
        puts += 1;
        throw new ConflictError();
      },
    };
    await expect(
      updateWithRetry<V>(always, 'c', 'k', (cur) => ({ ...cur }), noSleep)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(puts).toBe(5);
  });

  it('does not write on SKIP', async () => {
    const gw = new MemoryObjectGateway();
    await gw.put('c', 'k', { a: 1 });
    const spy = jest.spyOn(gw, 'put');
    const r = await updateWithRetry<V>(gw, 'c', 'k', () => SKIP, noSleep);
    expect(r.written).toBe(false);
    expect(r.value).toEqual({ a: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('backs off between attempts', async () => {
    const gw = new MemoryObjectGateway();
    await gw.put('c', 'k', {});
    const sleeps: number[] = [];
    const always: ObjectGateway = {
      get: (c, k) => gw.get(c, k),
      delete: (c, k, o) => gw.delete(c, k, o),
      query: (c, q) => gw.query(c, q),
      async put() {
        throw new ConflictError();
      },
    };
    await expect(
      updateWithRetry<V>(always, 'c', 'k', (cur) => ({ ...cur }), {
        sleep: async (ms) => void sleeps.push(ms),
        random: () => 0.5,
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(sleeps).toEqual([40, 80, 160, 320]);
  });
});
