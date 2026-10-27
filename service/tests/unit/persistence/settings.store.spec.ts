/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { SKIP } from '../../../src/persistence';
import { ValidationError } from '../../../src/persistence/gateway/errors';
import { GatewaySettingsStore } from '../../../src/persistence/stores/settings.store';
import { containers } from '../../../src/persistence/names';
import { makePersistence, spyGateway } from '../../helpers/persistence';
import { MemoryObjectGateway } from '../../../src/persistence/gateway/memory.gateway';

describe('SettingsStore', () => {
  it('returns defaults and does not create the object', async () => {
    const { p, mem } = makePersistence();
    const s = await p.settings.get();
    expect(s).toMatchObject({ toolCallLogs: 'all', systemPrompt: '' });
    expect(mem.containerNames()).toEqual([]);
  });

  it('keeps both of two concurrent partial updates', async () => {
    const { p } = makePersistence(undefined, { SETTINGS_CACHE_TTL_MS: '0' });
    // The very first write is an upsert without a version, so the object exists before the
    // race starts.
    await p.settings.update((s) => ({ ...s }));
    await Promise.all([
      p.settings.update((s) => ({ ...s, systemPrompt: 'be brief' })),
      p.settings.update((s) => ({ ...s, toolCallLogs: 'tools' })),
    ]);
    const s = await p.settings.get();
    expect(s.systemPrompt).toBe('be brief');
    expect(s.toolCallLogs).toBe('tools');
  });

  it('rejects an invalid mode and writes nothing', async () => {
    const { p, mem } = makePersistence();
    await expect(
      p.settings.update((s) => ({ ...s, toolCallLogs: 'verbose' as never }))
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mem.containerNames()).toEqual([]);
  });

  it('does not write on SKIP', async () => {
    const { p, mem } = makePersistence();
    await p.settings.update(() => SKIP);
    expect(mem.containerNames()).toEqual([]);
  });

  it('round trips an identity binding with numeric dates', async () => {
    const { p } = makePersistence(undefined, { SETTINGS_CACHE_TTL_MS: '0' });
    await p.settings.update((s) => ({
      ...s,
      identityMcp: {
        serverKey: 'sk',
        url: 'https://mcp.example.test/p/sk',
        majorVersion: '1',
        authenticationMode: 'CommercetoolsIdentity',
        connectedAt: 1234567890,
        discovery: { authorizationServers: ['https://a.example.test'], probedAt: 55 },
      },
    }));
    const s = await p.settings.get();
    expect(s.identityMcp?.connectedAt).toBe(1234567890);
    expect(s.identityMcp?.discovery?.probedAt).toBe(55);
  });

  describe('cache', () => {
    it('reads the gateway every time when the TTL is 0', async () => {
      const mem = new MemoryObjectGateway();
      const spy = spyGateway(mem);
      const store = new GatewaySettingsStore(
        { gw: spy, c: containers(), concurrency: 8 },
        0
      );
      await store.get();
      await store.get();
      expect(spy.calls.filter((c) => c.startsWith('get'))).toHaveLength(2);
    });

    it('serves from the cache within the TTL and invalidates on its own write', async () => {
      const mem = new MemoryObjectGateway();
      const spy = spyGateway(mem);
      let now = 1000;
      const store = new GatewaySettingsStore(
        { gw: spy, c: containers(), concurrency: 8 },
        5000,
        () => now
      );
      await store.get();
      now += 1000;
      await store.get();
      expect(spy.calls.filter((c) => c.startsWith('get'))).toHaveLength(1);
      await store.update((s) => ({ ...s, systemPrompt: 'x' }));
      expect((await store.get()).systemPrompt).toBe('x');
      now += 6000;
      await store.get();
      expect(spy.calls.filter((c) => c.startsWith('get')).length).toBeGreaterThanOrEqual(3);
    });
  });
});
