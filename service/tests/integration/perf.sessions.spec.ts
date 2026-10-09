/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createPersistence } from '../../src/persistence';
import { mapBounded } from '../../src/persistence/gateway/concurrency';
import { logger } from '../../src/utils/logger.utils';
import { cleanupRun, live, liveConfig, newRunPrefix } from './live';

/** Benchmark of the per-user session list (design D5): only runs with PERF=1 and credentials. */
const run = live && process.env.PERF === '1' ? describe : describe.skip;
const prefix = newRunPrefix();

run('session list performance (5000 sessions, 20 users)', () => {
  afterAll(() => cleanupRun(prefix));

  it('listByUser p95 stays under one second', async () => {
    const p = createPersistence(liveConfig(), { containerPrefix: prefix });
    const ids = Array.from({ length: 5000 }, (_, i) => i);
    await mapBounded(ids, 8, (i) =>
      p.sessions.create({
        id: `perf-${i}`,
        userId: `perf-user-${i % 20}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: 1,
      })
    );
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = Date.now();
      await p.sessions.listByUser(`perf-user-${i % 20}`, { limit: 100 });
      times.push(Date.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95) - 1];
    const t1 = Date.now();
    await p.sessions.listAll({ limit: 50 });
    logger.info(`perf: listByUser p95=${p95}ms median=${times[25]}ms listAll=${Date.now() - t1}ms`);
    expect(p95).toBeLessThan(1000);
  }, 1_800_000);
});
