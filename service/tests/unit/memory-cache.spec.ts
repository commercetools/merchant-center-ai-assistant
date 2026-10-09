/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { MemoryCache } from '../../src/cache/memory-cache';

const make = (maxEntries = 100) =>
  new MemoryCache({ maxEntries, sweepMs: 60000, sweep: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('MemoryCache', () => {
  it('expires entries', async () => {
    const c = make();
    await c.set('a', 'k', 'v', 50);
    expect(await c.get('a', 'k')).toBe('v');
    await sleep(100);
    expect(await c.get('a', 'k')).toBeNull();
  });

  it('evicts the oldest entry at capacity', async () => {
    const c = make(2);
    await c.set('a', '1', 1, 1000);
    await c.set('a', '2', 2, 1000);
    await c.set('a', '3', 3, 1000);
    expect(await c.get('a', '1')).toBeNull();
    expect(await c.get('a', '2')).toBe(2);
    expect(await c.get('a', '3')).toBe(3);
  });

  it('does not evict when overwriting an existing key', async () => {
    const c = make(2);
    await c.set('a', '1', 1, 1000);
    await c.set('a', '2', 2, 1000);
    await c.set('a', '2', 22, 1000);
    expect(await c.get('a', '1')).toBe(1);
    expect(await c.get('a', '2')).toBe(22);
  });

  it('scopes deletePrefix to its namespace', async () => {
    const c = make();
    await c.set('a', 'x1', 1, 1000);
    await c.set('a', 'y1', 2, 1000);
    await c.set('b', 'x1', 3, 1000);
    await c.deletePrefix('a', 'x');
    expect(await c.get('a', 'x1')).toBeNull();
    expect(await c.get('a', 'y1')).toBe(2);
    expect(await c.get('b', 'x1')).toBe(3);
  });

  it('clears a whole namespace and reports stats', async () => {
    const c = make();
    await c.set('a', '1', 1, 1000);
    await c.set('a', '2', 2, 1000);
    await c.set('b', '1', 3, 1000);
    expect(c.stats()).toEqual({ size: 3, namespaces: { a: 2, b: 1 } });
    await c.clearNamespace('a');
    expect(c.stats()).toEqual({ size: 1, namespaces: { b: 1 } });
  });

  it('deletes a single key', async () => {
    const c = make();
    await c.set('a', '1', 1, 1000);
    await c.delete('a', '1');
    expect(await c.get('a', '1')).toBeNull();
  });

  it('does not start a timer when sweep is disabled', () => {
    const spy = jest.spyOn(global, 'setInterval');
    make();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
