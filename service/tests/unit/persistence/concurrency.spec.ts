/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { mapBounded } from '../../../src/persistence/gateway/concurrency';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('mapBounded', () => {
  it('never exceeds the limit and keeps result order', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 100 }, (_, i) => i);
    const out = await mapBounded(items, 8, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
      return i * 2;
    });
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
    expect(out).toEqual(items.map((i) => i * 2));
  });

  it('stops scheduling after the first failure and rethrows it', async () => {
    const started: number[] = [];
    await expect(
      mapBounded(Array.from({ length: 50 }, (_, i) => i), 2, async (i) => {
        started.push(i);
        await tick();
        if (i === 3) throw new Error('boom');
        return i;
      })
    ).rejects.toThrow('boom');
    expect(started.length).toBeLessThan(50);
  });

  it('handles empty input', async () => {
    await expect(mapBounded([], 4, async () => 1)).resolves.toEqual([]);
  });
});
