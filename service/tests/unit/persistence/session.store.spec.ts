/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { deleteSessionCascade } from '../../../src/persistence';
import {
  ConflictError,
  InvalidIdError,
  NotFoundError,
  QueryLimitError,
} from '../../../src/persistence/gateway/errors';
import { makePersistence, session, spyGateway } from '../../helpers/persistence';

describe('SessionStore', () => {
  it('fails on a second create with the same id', async () => {
    const { p } = makePersistence();
    await p.sessions.create(session('s1', 'u1'));
    await expect(p.sessions.create(session('s1', 'u1'))).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects unsafe ids before any write', async () => {
    const { p, mem } = makePersistence();
    await expect(p.sessions.create(session('../x', 'u1'))).rejects.toBeInstanceOf(InvalidIdError);
    await expect(p.sessions.get('a b')).rejects.toBeInstanceOf(InvalidIdError);
    await expect(p.sessions.create(session('s1', 'a@b.example'))).rejects.toBeInstanceOf(
      InvalidIdError
    );
    expect(mem.containerNames()).toEqual([]);
  });

  it('keeps both a digest update and a concurrent touch', async () => {
    const { p } = makePersistence();
    await p.sessions.create(session('s1', 'u1'));
    await Promise.all([
      p.sessions.update('s1', (s) => ({ ...s, title: 'T', digestUpdatedAt: 9 })),
      p.sessions.touch('s1'),
    ]);
    const s = await p.sessions.get('s1');
    expect(s?.title).toBe('T');
    expect(s?.digestUpdatedAt).toBe(9);
    expect(s?.updatedAt).toBeGreaterThan(1);
  });

  it('throws NotFoundError when updating a missing session, and touch swallows it', async () => {
    const { p } = makePersistence();
    await expect(p.sessions.update('nope', (s) => s)).rejects.toBeInstanceOf(NotFoundError);
    await expect(p.sessions.touch('nope')).resolves.toBeUndefined();
  });

  it('isolates users', async () => {
    const { p } = makePersistence();
    await p.sessions.create(session('a1', 'userA'));
    await p.sessions.create(session('b1', 'userB'));
    await p.sessions.create(session('a2', 'userA'));
    const a = await p.sessions.listByUser('userA');
    expect(a.map((s) => s.id).sort()).toEqual(['a1', 'a2']);
    expect((await p.sessions.listByUser('userB')).map((s) => s.id)).toEqual(['b1']);
  });

  it('orders by recent activity (touch moves a session to the top)', async () => {
    const { p } = makePersistence();
    await p.sessions.create(session('s1', 'u'));
    await p.sessions.create(session('s2', 'u'));
    await p.sessions.create(session('s3', 'u'));
    expect((await p.sessions.listByUser('u')).map((s) => s.id)).toEqual(['s3', 's2', 's1']);
    await p.sessions.touch('s1');
    expect((await p.sessions.listByUser('u')).map((s) => s.id)).toEqual(['s1', 's3', 's2']);
  });

  it('matches feature flags in memory', async () => {
    const { p } = makePersistence();
    await p.sessions.create(session('plain', 'u'));
    await p.sessions.create(session('flagged', 'u', { featureFlags: { customView: 'x' } }));
    expect((await p.sessions.listByUser('u')).map((s) => s.id)).toEqual(['plain']);
    expect(
      (await p.sessions.listByUser('u', { featureFlags: { customView: 'x' } })).map((s) => s.id)
    ).toEqual(['flagged']);
    expect(
      await p.sessions.listByUser('u', { featureFlags: { customView: 'other' } })
    ).toEqual([]);
  });

  it('pages beyond 500 sessions and honours the limit', async () => {
    const spy = makePersistence((gw) => spyGateway(gw));
    // the five flagged sessions are the oldest, so they sit on the second page
    for (let i = 0; i < 520; i++) {
      await spy.mem.put(
        'ai-assistant-sessions',
        `s${i}`,
        session(`s${i}`, 'u', i < 5 ? { featureFlags: { customView: 'x' } } : {})
      );
    }
    const plain = await spy.p.sessions.listByUser('u', { limit: 500 });
    expect(plain).toHaveLength(500);
    const flagged = await spy.p.sessions.listByUser('u', {
      limit: 3,
      featureFlags: { customView: 'x' },
    });
    expect(flagged).toHaveLength(3);
    expect(flagged.every((s) => s.featureFlags?.customView === 'x')).toBe(true);
  });

  it('listAll filters by time range and user, newest first, with a total', async () => {
    const { p, mem } = makePersistence();
    await p.sessions.create(session('s1', 'u1'));
    const s2 = await p.sessions.create(session('s2', 'u2')).then(() =>
      mem.get('ai-assistant-sessions', 's2')
    );
    await p.sessions.create(session('s3', 'u1'));
    const all = await p.sessions.listAll({ limit: 10 });
    expect(all.items.map((s) => s.id)).toEqual(['s3', 's2', 's1']);
    expect(all.total).toBe(3);
    const after = await p.sessions.listAll({ limit: 10, createdAfter: s2?.createdAt });
    expect(after.items.map((s) => s.id)).toEqual(['s3']);
    const mine = await p.sessions.listAll({ limit: 10, userId: 'u1' });
    expect(mine.items.map((s) => s.id)).toEqual(['s3', 's1']);
    await expect(p.sessions.listAll({ limit: 500, offset: 9600 })).rejects.toBeInstanceOf(
      QueryLimitError
    );
  });

  it('deletes the object only with delete, everything with the cascade', async () => {
    const { p } = makePersistence();
    await p.sessions.create(session('s1', 'u'));
    await p.messages.put('s1', [{ id: 'm1', role: 'user', parts: [] }]);
    expect(await p.sessions.delete('s1')).toBe(true);
    expect(await p.sessions.delete('s1')).toBe(false);
    expect(await p.messages.count('s1')).toBe(1);
    await p.sessions.create(session('s2', 'u'));
    await p.messages.put('s2', [{ id: 'm1', role: 'user', parts: [] }]);
    expect(await deleteSessionCascade(p, 's2')).toBe(true);
    expect(await p.sessions.get('s2')).toBeNull();
    expect(await p.messages.count('s2')).toBe(0);
  });
});
