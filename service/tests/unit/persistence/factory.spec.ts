/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  createPersistence,
  getPersistence,
  resetPersistenceForTests,
} from '../../../src/persistence';
import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';
import { resetConfigurationForTests } from '../../../src/config';
import { baseEnv, freshConfig } from '../../helpers/env';
import { session, spyGateway } from '../../helpers/persistence';
import { deleteSessionCascade } from '../../../src/persistence';

describe('createPersistence', () => {
  it('returns working stores on the memory driver', async () => {
    const p = createPersistence(freshConfig());
    await p.sessions.create(session('s1', 'u1'));
    expect((await p.sessions.get('s1'))?.userId).toBe('u1');
    expect((await p.settings.get()).toolCallLogs).toBe('all');
  });

  it('honours a custom gateway and the container prefix', async () => {
    const gw = new MemoryObjectGateway();
    const p = createPersistence(freshConfig(), {
      gateway: gw,
      containerPrefix: 'ai-assistant-it-abc',
    });
    await p.sessions.create(session('s1', 'u1'));
    await p.messages.put('s1', [{ id: 'm1', role: 'user', parts: [] }]);
    expect(gw.containerNames().sort()).toEqual([
      'ai-assistant-it-abc-messages-s1',
      'ai-assistant-it-abc-sessions',
    ]);
    expect(p.gateway).toBe(gw);
  });

  it('applies the configured concurrency to stores that need it', () => {
    const cfg = freshConfig({ PERSISTENCE_CONCURRENCY: '3' });
    expect(cfg.persistence.concurrency).toBe(3);
    expect(() => createPersistence(cfg)).not.toThrow();
  });

  it('memoises the process-wide instance', () => {
    resetConfigurationForTests();
    resetPersistenceForTests();
    freshConfig();
    expect(getPersistence()).toBe(getPersistence());
    resetPersistenceForTests();
    resetConfigurationForTests();
    void baseEnv;
  });

  it('cascade delete removes 50 messages then the session, and is re-runnable after a failure', async () => {
    let deletes = 0;
    let failAt = 21;
    const mem = new MemoryObjectGateway();
    const gw = spyGateway(mem, {
      onDelete: () => {
        deletes += 1;
        if (deletes === failAt) throw new Error('boom');
      },
    });
    const p = createPersistence(freshConfig({ PERSISTENCE_CONCURRENCY: '1' }), { gateway: gw });
    await p.sessions.create(session('s1', 'u'));
    await p.messages.put(
      's1',
      Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, role: 'user' as const, parts: [] }))
    );
    await expect(deleteSessionCascade(p, 's1')).rejects.toThrow('boom');
    expect(await p.sessions.get('s1')).not.toBeNull();
    expect(await p.messages.count('s1')).toBeLessThan(50);
    failAt = -1;
    expect(await deleteSessionCascade(p, 's1')).toBe(true);
    expect(await p.sessions.get('s1')).toBeNull();
    expect(await p.messages.count('s1')).toBe(0);
  });
});
