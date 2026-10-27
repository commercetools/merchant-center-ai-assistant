/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { MessageStore, SessionRecord } from '../../src/persistence';
import type { RequestUser } from '../../src/types/request.types';
import { makeSessionApp, resetSessionApp } from '../helpers/session-app';

/**
 * `GET /service/session/all` backs the Chats drawer, the empty state's "Pick up where you
 * left off" list and the conversation header. A digested session must be served from its own
 * object (no message read: the N+1 would come back invisibly), and an undigested one must
 * still get a title from its first message.
 */

const USER: RequestUser = { userId: 'user-a', projectKey: 'p', isAdmin: false };

const session = (id: string, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  userId: USER.userId,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_500_000,
  title: 'New chat',
  schemaVersion: 1,
  ...extra,
});

afterEach(resetSessionApp);

const setup = async (sessions: SessionRecord[]) => {
  const t = makeSessionApp();
  for (const s of sessions) await t.persistence.sessions.create(s);
  const reads: string[] = [];
  const original: MessageStore['list'] = t.persistence.messages.list.bind(t.persistence.messages);
  t.persistence.messages.list = async (sessionId, o) => {
    reads.push(sessionId);
    return original(sessionId, o);
  };
  return { ...t, reads };
};

const userMessage = (text: string) => ({
  id: 'm1',
  role: 'user' as const,
  parts: [{ type: 'text', text }],
});

describe('session list rows', () => {
  it('a digested session is served from its own object, with no message read', async () => {
    const { services, reads } = await setup(
      Array.from({ length: 30 }, (_, i) =>
        session(`s${i}`, {
          title: 'Underperforming products, September',
          description: 'Three products are below their revenue target.',
          icon: 'trending_down',
          digestUpdatedAt: 1_700_000_400_000,
        })
      )
    );
    const rows = await services.sessions.list(USER);
    expect(rows).toHaveLength(30);
    expect(rows[0]).toMatchObject({
      title: 'Underperforming products, September',
      description: 'Three products are below their revenue target.',
      icon: 'trending_down',
    });
    expect(reads).toHaveLength(0);
  });

  it('a session with no digest gets a title from its first message', async () => {
    const { services, persistence, reads } = await setup([session('s1')]);
    await persistence.messages.put('s1', [
      userMessage('Which products are underperforming this month?'),
    ]);
    const [row] = await services.sessions.list(USER);
    expect(row.title).toBe('Which products are underperforming this month?');
    expect(row.description).toBeUndefined();
    expect(row.icon).toBeUndefined();
    expect(reads).toEqual(['s1']);
  });

  it('a long first message is cut to 50 characters plus an ellipsis', async () => {
    const { services, persistence } = await setup([session('s1')]);
    await persistence.messages.put('s1', [userMessage('x'.repeat(80))]);
    const [row] = await services.sessions.list(USER);
    expect(row.title).toBe(`${'x'.repeat(50)}...`);
  });

  it('a session with neither digest nor messages keeps its stored title', async () => {
    const { services } = await setup([session('s1', { title: 'Kept' })]);
    expect((await services.sessions.list(USER))[0].title).toBe('Kept');
  });

  it('a failed message read never takes the whole list down', async () => {
    const { services, persistence } = await setup([
      session('legacy', { updatedAt: 2 }),
      session('digested', { title: 'Recent orders', digestUpdatedAt: 1, updatedAt: 1 }),
    ]);
    persistence.messages.list = async () => {
      throw new Error('unavailable');
    };
    const rows = await services.sessions.list(USER);
    expect(rows.map((r) => r.id)).toEqual(['legacy', 'digested']);
    expect(rows[0].title).toBe('New chat');
    expect(rows[1].title).toBe('Recent orders');
  });

  it('limit bounds the list and the fallback reads it would have done', async () => {
    const { services, reads } = await setup(
      Array.from({ length: 25 }, (_, i) => session(`s${i}`, { updatedAt: 1000 + i }))
    );
    const rows = await services.sessions.list(USER, { limit: 4 });
    expect(rows.map((r) => r.id)).toEqual(['s24', 's23', 's22', 's21']);
    expect(reads).toHaveLength(4);
  });

  it('returns the timestamps', async () => {
    const { services } = await setup([session('s1', { digestUpdatedAt: 1, title: 'Any' })]);
    const [row] = await services.sessions.list(USER);
    expect(row.createdAt).toBe(1_700_000_000_000);
    expect(row.updatedAt).toBeGreaterThan(0);
  });
});
