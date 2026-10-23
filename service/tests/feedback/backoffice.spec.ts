/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';
import { asUser, FeedbackHarness, makeFeedbackHarness } from '../helpers/feedback-app';
import { captureLogs } from '../helpers/log-capture';
import { session, spyGateway } from '../helpers/persistence';

beforeEach(() => {
  freshConfig();
});
afterAll(() => resetConfigurationForTests());

const seed = async (h: FeedbackHarness, id: string, userId: string, n = 2, extra = {}) => {
  await h.p.sessions.create(session(id, userId, { title: `title-${id}`, ...extra }));
  if (n > 0) {
    await h.p.messages.put(
      id,
      Array.from({ length: n }, (_, i) => ({
        id: `${id}-m${String(i).padStart(4, '0')}`,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        parts: [{ type: 'text', text: `msg ${i}` }],
      }))
    );
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const admin = asUser('adm', true);

describe('is-admin', () => {
  it('answers the service-computed value, ignoring forged input', async () => {
    const h = makeFeedbackHarness();
    const forged = {
      'x-admin-email': 'boss@example.com',
      ...asUser('u1'),
    };
    const no = await request(h.app)
      .get('/service/backoffice/is-admin?userEmail=boss@example.com')
      .set(forged);
    expect(no.status).toBe(200);
    expect(no.body).toEqual({ success: true, data: { isAdmin: false } });
    const yes = await request(h.app).get('/service/backoffice/is-admin').set(admin);
    expect(yes.body.data.isAdmin).toBe(true);
  });
});

describe('thread listing', () => {
  it('lists the sessions of all users', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a');
    await seed(h, 'sb', 'user-b');
    const res = await request(h.app).post('/service/backoffice/threads').set(admin).send({});
    expect(res.status).toBe(200);
    const items = res.body.data as Array<{ sessionId: string; userId: string; messages: unknown[] }>;
    expect(items.map((t) => t.userId).sort()).toEqual(['user-a', 'user-b']);
    expect(items.every((t) => t.messages.length === 2)).toBe(true);
    expect(res.body.pagination).toEqual({ limit: 10, offset: 0, total: 2 });
  });

  it('?sort=lastModifiedAt lists the most recently written thread first; other values keep createdAt order', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a', 0);
    await seed(h, 'sb', 'user-b', 0);
    await seed(h, 'sc', 'user-c', 0);
    await h.p.sessions.touch('sa');
    const ids = async (query: string) =>
      (
        (await request(h.app).post(`/service/backoffice/threads${query}`).set(admin).send({}))
          .body.data as Array<{ sessionId: string }>
      ).map((t) => t.sessionId);
    expect(await ids('')).toEqual(['sc', 'sb', 'sa']);
    expect(await ids('?sort=lastModifiedAt')).toEqual(['sa', 'sc', 'sb']);
    expect(await ids('?sort=bogus')).toEqual(['sc', 'sb', 'sa']);
  });

  it('shapes a thread and carries the unverified label for display', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a', 1, { userLabel: 'Alice' });
    const res = await request(h.app).post('/service/backoffice/threads').set(admin).send({});
    expect(res.body.data[0]).toEqual({
      sessionId: 'sa',
      userId: 'user-a',
      userLabel: 'Alice',
      title: 'title-sa',
      createdAt: 1,
      updatedAt: 1,
      messages: [expect.objectContaining({ id: 'sa-m0000', role: 'user' })],
      truncated: false,
    });
  });

  it('applies the date filter (declared but never applied in legacy)', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 's1', 'user-a', 0);
    await wait(20);
    const cut = Date.now();
    await wait(20);
    await seed(h, 's2', 'user-a', 0);
    await seed(h, 's3', 'user-b', 0);
    const before = await request(h.app)
      .post('/service/backoffice/threads')
      .set(admin)
      .send({ filters: { createdAtBefore: cut } });
    expect(before.body.data.map((t: { sessionId: string }) => t.sessionId)).toEqual(['s1']);
    const after = await request(h.app)
      .post('/service/backoffice/threads')
      .set(admin)
      .send({ filters: { createdAtAfter: cut } });
    expect(after.body.data).toHaveLength(2);
  });

  it('filters by userId only; a userLabel filter is ignored', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a', 0, { userLabel: 'x' });
    await seed(h, 'sb', 'user-b', 0);
    const byUser = await request(h.app)
      .post('/service/backoffice/threads')
      .set(admin)
      .send({ filters: { userId: 'user-b' } });
    expect(byUser.body.data.map((t: { userId: string }) => t.userId)).toEqual(['user-b']);
    const byLabel = await request(h.app)
      .post('/service/backoffice/threads')
      .set(admin)
      .send({ filters: { userLabel: 'x', userEmail: 'a@example.com' } });
    expect(byLabel.body.data).toHaveLength(2);
  });

  it('makes no message read with messages=false', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = makeFeedbackHarness((gw) => (spy = spyGateway(gw)));
    await seed(h, 'sa', 'user-a');
    spy?.calls.splice(0);
    const res = await request(h.app)
      .post('/service/backoffice/threads?messages=false')
      .set(admin)
      .send({});
    expect(res.body.data[0].messages).toEqual([]);
    expect(spy?.calls.some((c) => c.includes('-messages-'))).toBe(false);
  });

  it('clamps the limit to 25', async () => {
    const h = makeFeedbackHarness();
    const res = await request(h.app)
      .post('/service/backoffice/threads?limit=100&offset=-1')
      .set(admin)
      .send({});
    expect(res.body.pagination).toMatchObject({ limit: 25, offset: 0 });
  });

  it('marks a thread truncated above 2000 messages', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a', 0);
    const rows = Array.from({ length: 2005 }, (_, i) => ({
      id: `m${String(i).padStart(5, '0')}`,
      role: 'user' as const,
      parts: [],
    }));
    await h.p.messages.put('sa', rows);
    const res = await request(h.app).get('/service/backoffice/threads/sa').set(admin);
    expect(res.body.data.messages).toHaveLength(2000);
    expect(res.body.data.truncated).toBe(true);
    expect(res.body.data.messages[0].id).toBe('m00000');
  }, 60_000);

  it('refuses a non-admin with 403 ADMIN_REQUIRED before any store read', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = makeFeedbackHarness((gw) => (spy = spyGateway(gw)));
    const res = await request(h.app).post('/service/backoffice/threads').set(asUser('u1')).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
    expect(spy?.calls).toEqual([]);
  });
});

describe('thread detail', () => {
  it('returns the thread of another user and audits the read', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a', 3);
    const logs = captureLogs();
    const res = await request(h.app).get('/service/backoffice/threads/sa').set(admin);
    logs.stop();
    expect(res.status).toBe(200);
    expect(res.body.data.messages).toHaveLength(3);
    const text = logs.lines.join('\n');
    expect(text).toContain('backoffice.thread.read');
    expect(text).toContain('"sessionUserId":"user-a"');
    expect(text).toContain('adm');
    expect(text).not.toContain('msg 0');
  });

  it('answers 404 for an unknown thread and an unsafe id', async () => {
    const h = makeFeedbackHarness();
    for (const id of ['nope', 'a.b']) {
      const res = await request(h.app).get(`/service/backoffice/threads/${id}`).set(admin);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Thread not found' });
    }
  });

  it('audits the listing with the acting admin id and a count', async () => {
    const h = makeFeedbackHarness();
    await seed(h, 'sa', 'user-a', 0);
    const logs = captureLogs();
    await request(h.app).post('/service/backoffice/threads').set(admin).send({});
    logs.stop();
    const text = logs.lines.join('\n');
    expect(text).toContain('backoffice.threads.listed');
    expect(text).toContain('"count":1');
  });
});
