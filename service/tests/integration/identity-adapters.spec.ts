/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createIdentityStores } from '../../src/identity-mcp/adapters/persistence';
import { createPersistence } from '../../src/persistence';
import { bindingFixture, tokenRecordFixture } from '../identity-mcp/helpers';
import { cleanupRun, liveConfig, liveDescribe, newRunPrefix } from './live';

const prefix = newRunPrefix();

/** Same scenarios as tests/identity-mcp/adapters.spec.ts, on the real Custom Objects API. */
liveDescribe('identity adapters on the real gateway', () => {
  const stores = () =>
    createIdentityStores(
      createPersistence(liveConfig(), { containerPrefix: prefix })
    );
  afterAll(() => cleanupRun(prefix));

  it('token compare-and-delete, stale put and delete-all', async () => {
    const s = stores();
    expect(
      await s.tokens.put(
        tokenRecordFixture({ userId: 'it-u1', issuedAt: 2000 })
      )
    ).toBe('written');
    expect(
      await s.tokens.put(
        tokenRecordFixture({ userId: 'it-u1', issuedAt: 1000 })
      )
    ).toBe('stale-ignored');
    const read = await s.tokens.get('it-u1');
    expect(await s.tokens.deleteIfVersion('it-u1', read!.version + 1)).toBe(
      'conflict'
    );
    expect(await s.tokens.deleteIfVersion('it-u1', read!.version)).toBe(
      'deleted'
    );
    await s.tokens.put(tokenRecordFixture({ userId: 'it-u2' }));
    expect(await s.tokens.deleteAll()).toBeGreaterThanOrEqual(1);
  });

  it('setClient keeps the binding fields', async () => {
    const s = stores();
    await s.binding.set(bindingFixture());
    await s.binding.setClient(null);
    expect((await s.binding.get())?.serverKey).toBe(bindingFixture().serverKey);
    await s.binding.clear();
  });
});
