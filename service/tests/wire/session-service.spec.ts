/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ConflictError } from '../../src/persistence/gateway/errors';
import {
  registerSessionCleanupHook,
  SessionService,
} from '../../src/services/session.service';
import type { ChatSession } from '../../src/types/chat.types';
import type { RequestUser } from '../../src/types/request.types';
import { makeGApp, resetGApp } from '../helpers/g-app';
import { spyGateway } from '../helpers/persistence';

const A: RequestUser = { userId: 'user-a', projectKey: 'p', isAdmin: false };
const B: RequestUser = { userId: 'user-b', projectKey: 'p', isAdmin: false };

afterEach(resetGApp);

describe('SessionService', () => {
  it('create applies defaults and the verified user id', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(A, {});
    expect(s.title).toBe('New chat');
    expect(s.userId).toBe('user-a');
    expect(s.metadata).toEqual({});
    expect(s.featureFlags).toBeUndefined();
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.createdAt).toBe(s.updatedAt);
  });

  it('create stores a sanitised label and never uses it as identity', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(A, { userLabel: ' <b>Ann</b>\u0007 ' });
    expect(s.userLabel).toBe('bAnn/b');
    expect(s.userId).toBe('user-a');
    const empty = await services.sessions.create(A, { userLabel: '<>' });
    expect(empty.userLabel).toBeUndefined();
  });

  it('isolates users', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(A, {});
    expect(await services.sessions.get(s.id, A)).not.toBeNull();
    expect(await services.sessions.get(s.id, B)).toBeNull();
    expect(await services.sessions.update(s.id, B, { title: 'x' })).toBeNull();
    expect(await services.sessions.remove(s.id, B)).toBe(false);
    expect((await services.sessions.get(s.id, A))?.title).toBe('New chat');
  });

  it('update changes only title and metadata and refreshes updatedAt', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(A, {});
    await new Promise((r) => setTimeout(r, 3));
    const updated = (await services.sessions.update(s.id, A, {
      title: 'T',
      metadata: { k: 1 },
      // Extra keys cannot be passed through the typed API; the route ignores them.
    })) as ChatSession;
    expect(updated.title).toBe('T');
    expect(updated.metadata).toEqual({ k: 1 });
    expect(updated.userId).toBe('user-a');
    expect(updated.updatedAt).toBeGreaterThan(s.updatedAt);
  });

  it('a version conflict on a digest write keeps both the digest and the tools change', async () => {
    let conflicts = 1;
    const { services, mem } = makeGApp({
      wrap: (gw) =>
        spyGateway(gw, {
          onPut: (container) => {
            if (container.includes('sessions') && conflicts > 0 && armed) {
              conflicts -= 1;
              throw new ConflictError('forced');
            }
          },
        }),
    });
    let armed = false;
    const s = await services.sessions.create(A, {});
    armed = true;
    const [digested, tooled] = await Promise.all([
      services.sessions.applySessionDigest(s.id, A.userId, {
        title: 'D',
        description: 'd',
        icon: 'sell',
        summary: 's',
        nextPrompts: [],
      }),
      services.sessions.updateDisabledTools(s.id, A, (cur) => ({ ...cur, knowledge: ['b'] })),
    ]);
    expect(digested).not.toBeNull();
    expect(tooled).not.toBeNull();
    const final = await services.sessions.get(s.id, A);
    expect(final?.title).toBe('D');
    expect(final?.disabledTools).toEqual({ knowledge: ['b'] });
    expect(mem).toBeDefined();
  });

  it('applySessionDigest does nothing for a foreign or missing session', async () => {
    const { services } = makeGApp();
    const s = await services.sessions.create(A, {});
    const digest = { title: 'x', description: '', icon: 'sell', summary: '', nextPrompts: [] };
    expect(await services.sessions.applySessionDigest(s.id, B.userId, digest)).toBeNull();
    expect(await services.sessions.applySessionDigest('missing', A.userId, digest)).toBeNull();
    expect((await services.sessions.get(s.id, A))?.title).toBe('New chat');
  });

  describe('delete and cleanup hooks', () => {
    it('runs hooks with the session before it is removed', async () => {
      const { services } = makeGApp();
      const s = await services.sessions.create(A, {});
      await services.messages.appendMissing(s.id, [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ]);
      const seen: string[] = [];
      registerSessionCleanupHook(async (session) => {
        // Still present while the hook runs.
        seen.push(`${session.id}:${(await services.sessions.get(session.id, A)) ? 'present' : 'gone'}`);
      });
      expect(await services.sessions.remove(s.id, A)).toBe(true);
      expect(seen).toEqual([`${s.id}:present`]);
      expect(await services.sessions.get(s.id, A)).toBeNull();
      expect(await services.messages.list(s.id)).toEqual([]);
    });

    it('a failing hook does not stop the deletion', async () => {
      const { services } = makeGApp();
      const s = await services.sessions.create(A, {});
      registerSessionCleanupHook(async () => {
        throw new Error('bigquery down');
      });
      expect(await services.sessions.remove(s.id, A)).toBe(true);
      expect(await services.sessions.get(s.id, A)).toBeNull();
    });

    it('a second delete answers false', async () => {
      const { services } = makeGApp();
      const s = await services.sessions.create(A, {});
      await services.sessions.remove(s.id, A);
      expect(await services.sessions.remove(s.id, A)).toBe(false);
    });
  });

  describe('temporary tables', () => {
    const table = { tableRef: 'ds.t1', toolName: 'export', args: '{}', columnNames: 'a, b' };

    it('de-duplicates by tableRef', async () => {
      const { services } = makeGApp();
      const s = await services.sessions.create(A, {});
      await services.sessions.addTemporaryTable(s.id, A, table);
      const tables = await services.sessions.addTemporaryTable(s.id, A, table);
      expect(tables).toHaveLength(1);
      expect(await services.sessions.getAllTemporaryTables(s.id, A)).toHaveLength(1);
    });

    it('renders columns in the message text only when known', async () => {
      const { services } = makeGApp();
      const s = await services.sessions.create(A, {});
      await services.sessions.addTemporaryTable(s.id, A, table);
      await services.sessions.addTemporaryTable(s.id, A, {
        tableRef: 'ds.t2',
        toolName: 'export',
        args: '{}',
      });
      const [first, second] = await services.sessions.getTemporaryTableMessages(s.id, A);
      expect(first).toContain(', columns: a, b');
      expect(second).not.toContain('columns:');
    });

    it('refuses a foreign session', async () => {
      const { services } = makeGApp();
      const s = await services.sessions.create(A, {});
      await expect(services.sessions.addTemporaryTable(s.id, B, table)).rejects.toThrow();
    });
  });

  describe('flag-scoped listing', () => {
    it('returns the right four of 1200 with limit=4 and never another user', async () => {
      const { services, persistence } = makeGApp();
      // Written straight to the store: 1 200 sessions, a few flagged, some of another user.
      const mk = (i: number, userId: string, flags?: { customView: string }) =>
        persistence.sessions.create({
          id: `s${i}`,
          userId,
          createdAt: 1,
          updatedAt: 1,
          title: `t${i}`,
          ...(flags ? { featureFlags: flags } : {}),
          schemaVersion: 1,
        });
      for (let i = 0; i < 1200; i++) {
        await mk(i, i % 7 === 0 ? 'user-b' : 'user-a', i % 100 === 3 ? { customView: 'X' } : undefined);
      }
      const plain = await services.sessions.list(A, { limit: 4 });
      expect(plain).toHaveLength(4);
      const flagged = await services.sessions.list(A, { limit: 4, flags: { customView: 'X' } });
      expect(flagged).toHaveLength(4);
      const ids = await services.sessions.listRecords(A, { flags: { customView: 'X' } });
      expect(ids.every((s) => s.userId === 'user-a' && s.featureFlags?.customView === 'X')).toBe(true);
      const all = await services.sessions.listRecords(A);
      expect(all.every((s) => s.userId === 'user-a' && !s.featureFlags)).toBe(true);
    }, 60_000);
  });

  it('is constructible from stores alone', () => {
    const { persistence } = makeGApp();
    expect(new SessionService(persistence.sessions, persistence.messages)).toBeDefined();
  });
});
