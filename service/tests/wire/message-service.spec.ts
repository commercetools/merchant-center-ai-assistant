/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestUser } from '../../src/types/request.types';
import { makeGApp, resetGApp } from '../helpers/g-app';

const USER: RequestUser = { userId: 'user-a', projectKey: 'p', isAdmin: false };
const msg = (id: string, role: 'user' | 'assistant' = 'user') => ({
  id,
  role,
  parts: [{ type: 'text', text: id }],
});

afterEach(resetGApp);

describe('MessageService', () => {
  it('appendMissing is idempotent by message id', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(USER, {});
    const first = await services.messages.appendMissing(s.id, [msg('m1'), msg('m2')]);
    expect(first.map((m) => m.id)).toEqual(['m1', 'm2']);
    const second = await services.messages.appendMissing(s.id, [msg('m1'), msg('m2')]);
    expect(second).toEqual([]);
    expect(await services.messages.list(s.id)).toHaveLength(2);
  });

  it('stores only the missing ones and ignores a duplicate inside one call', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(USER, {});
    await services.messages.appendMissing(s.id, [msg('m1')]);
    const stored = await services.messages.appendMissing(s.id, [msg('m1'), msg('m2'), msg('m2')]);
    expect(stored.map((m) => m.id)).toEqual(['m2']);
  });

  it('bumps the session updatedAt', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(USER, {});
    await new Promise((r) => setTimeout(r, 3));
    await services.messages.appendMissing(s.id, [msg('m1')]);
    expect((await services.sessions.get(s.id, USER))?.updatedAt).toBeGreaterThan(s.updatedAt);
  });

  it('lastN returns the newest N, oldest of them first', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(USER, {});
    for (let i = 0; i < 45; i++) {
      await services.messages.appendMissing(s.id, [msg(`m${String(i).padStart(2, '0')}`)]);
    }
    const last = await services.messages.lastN(s.id, 20);
    expect(last).toHaveLength(20);
    expect(last[0].id).toBe('m25');
    expect(last[19].id).toBe('m44');
  });

  it('list honours limit and offset, oldest first', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(USER, {});
    await services.messages.appendMissing(s.id, [msg('a'), msg('b'), msg('c'), msg('d')]);
    expect((await services.messages.list(s.id, { limit: 2 })).map((m) => m.id)).toEqual(['a', 'b']);
    expect((await services.messages.list(s.id, { limit: 2, offset: 1 })).map((m) => m.id)).toEqual(['b', 'c']);
    expect((await services.messages.list(s.id, { offset: 3 })).map((m) => m.id)).toEqual(['d']);
  });
});
