/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { registerSessionCleanupHook } from '../../src/services/session.service';
import { asUser, makeGApp, resetGApp } from '../helpers/g-app';

const A = asUser('user-a');
const B = asUser('user-b');

afterEach(resetGApp);

const create = async (app: ReturnType<typeof makeGApp>['app'], who = A, body: object = {}) => {
  const res = await request(app).post('/service/session').set(who).send(body);
  return res.body.data as { id: string; title: string; userId: string };
};

describe('POST /session', () => {
  it('creates with defaults (201, verified user id, no tenant fields)', async () => {
    const { app } = makeGApp();
    const res = await request(app).post('/service/session').set(A).send({});
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('New chat');
    expect(res.body.data.userId).toBe('user-a');
    expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/projectKey|tenant|userEmail/);
  });

  it('binds to a custom view', async () => {
    const { app } = makeGApp();
    const res = await request(app)
      .post('/service/session')
      .set(A)
      .send({ featureFlags: { customView: 'L3Byb2R1Y3Rz' } });
    expect(res.body.data.featureFlags).toEqual({ customView: 'L3Byb2R1Y3Rz' });
  });

  it('stores a sanitised display label but keeps the verified id', async () => {
    const { app } = makeGApp();
    const res = await request(app)
      .post('/service/session')
      .set(A)
      .send({ userLabel: '  <b>Ann</b>\u0007 Admin  ' });
    expect(res.body.data.userLabel).toBe('bAnn/b Admin');
    expect(res.body.data.userId).toBe('user-a');
  });

  it.each([
    [{ title: 5 }],
    [{ title: 'x'.repeat(201) }],
    [{ metadata: [] }],
    [{ featureFlags: 'x' }],
    [{ featureFlags: { a: { b: 1 } } }],
  ])('rejects an invalid body %j', async (body) => {
    const { app } = makeGApp();
    const res = await request(app).post('/service/session').set(A).send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('reading', () => {
  it('404 envelope for an unknown session', async () => {
    const { app } = makeGApp();
    const res = await request(app).get('/service/session/00000000-0000-4000-8000-000000000000').set(A);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Session not found' });
  });

  it('404 for another user across every :sessionId route', async () => {
    const { app } = makeGApp();
    const s = await create(app);
    const base = `/service/session/${s.id}`;
    for (const [method, path] of [
      ['get', ''],
      ['put', ''],
      ['delete', ''],
      ['get', '/messages'],
      ['get', '/digest'],
      ['get', '/tools'],
      ['post', '/tools'],
      ['put', '/tools'],
    ] as const) {
      const res = await request(app)[method](base + path).set(B).send({});
      expect([method + path, res.status]).toEqual([method + path, 404]);
    }
    expect((await request(app).get(base).set(A)).status).toBe(200);
  });

  it('GET / answers the last matching session or 404', async () => {
    const { app } = makeGApp();
    expect((await request(app).get('/service/session').set(A)).status).toBe(404);
    const s = await create(app);
    const res = await request(app).get('/service/session').set(A);
    expect(res.body.data.id).toBe(s.id);
  });

  it('list is newest first, own sessions only, with a limit', async () => {
    const { app } = makeGApp();
    const ids: string[] = [];
    for (let i = 0; i < 9; i++) {
      ids.push((await create(app)).id);
      await new Promise((r) => setTimeout(r, 2));
    }
    await create(app, B);
    const all = await request(app).get('/service/session/all').set(A);
    expect(all.body.data).toHaveLength(9);
    expect(all.body.data.map((r: { id: string }) => r.id)).toEqual([...ids].reverse());
    const limited = await request(app).get('/service/session/all?limit=4').set(A);
    expect(limited.body.data.map((r: { id: string }) => r.id)).toEqual(ids.slice(-4).reverse());
    const bogus = await request(app).get('/service/session/all?limit=abc').set(A);
    expect(bogus.body.data).toHaveLength(9);
  });

  it('feature flags scope the list and the last session', async () => {
    const { app } = makeGApp();
    const plain = await create(app);
    const flagged = await create(app, A, { featureFlags: { customView: 'X' } });
    const withFlag = await request(app).get('/service/session/all?customView=X').set(A);
    expect(withFlag.body.data.map((r: { id: string }) => r.id)).toEqual([flagged.id]);
    const without = await request(app).get('/service/session/all').set(A);
    expect(without.body.data.map((r: { id: string }) => r.id)).toEqual([plain.id]);
    const last = await request(app).get('/service/session?customView=X').set(A);
    expect(last.body.data.id).toBe(flagged.id);
  });

  it('messages of a mismatching session come from the last matching one, or 404', async () => {
    const { app, services } = makeGApp();
    const plain = await create(app);
    await services.messages.appendMissing(plain.id, [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'plain' }] },
    ]);
    const none = await request(app).get(`/service/session/${plain.id}/messages?customView=X`).set(A);
    expect(none.status).toBe(404);
    const flagged = await create(app, A, { featureFlags: { customView: 'X' } });
    await services.messages.appendMissing(flagged.id, [
      { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'flagged' }] },
    ]);
    const res = await request(app).get(`/service/session/${plain.id}/messages?customView=X`).set(A);
    expect(res.body.data.map((m: { id: string }) => m.id)).toEqual(['m2']);
  });

  it('messages are oldest first and honour limit / offset', async () => {
    const { app, services } = makeGApp();
    const s = await create(app);
    await services.messages.appendMissing(s.id, [
      { id: 'a', role: 'user', parts: [] },
      { id: 'b', role: 'assistant', parts: [] },
      { id: 'c', role: 'user', parts: [] },
    ]);
    const res = await request(app).get(`/service/session/${s.id}/messages?limit=2&offset=1`).set(A);
    expect(res.body.data.map((m: { id: string }) => m.id)).toEqual(['b', 'c']);
    const ignored = await request(app).get(`/service/session/${s.id}/messages?limit=-1&offset=x`).set(A);
    expect(ignored.body.data).toHaveLength(3);
  });
});

describe('update and delete', () => {
  it('PUT applies only title and metadata', async () => {
    const { app } = makeGApp();
    const s = await create(app);
    const res = await request(app)
      .put(`/service/session/${s.id}`)
      .set(A)
      .send({ title: 'T', userId: 'evil', disabledTools: { x: ['y'] }, metadata: { k: 1 } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'T', userId: 'user-a', metadata: { k: 1 } });
    expect(res.body.data.disabledTools).toBeUndefined();
  });

  it('PUT rejects a non-string title', async () => {
    const { app } = makeGApp();
    const s = await create(app);
    const res = await request(app).put(`/service/session/${s.id}`).set(A).send({ title: 7 });
    expect(res.status).toBe(400);
  });

  it('DELETE runs hooks, answers a top-level message, then 404 the second time', async () => {
    const { app, services } = makeGApp();
    const s = await create(app);
    await services.messages.appendMissing(s.id, [{ id: 'm1', role: 'user', parts: [] }]);
    const seen: string[] = [];
    registerSessionCleanupHook(async (session) => {
      seen.push(session.id);
      throw new Error('hook failure must not fail the request');
    });
    const res = await request(app).delete(`/service/session/${s.id}`).set(A);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Session deleted successfully' });
    expect(seen).toEqual([s.id]);
    expect((await request(app).delete(`/service/session/${s.id}`).set(A)).status).toBe(404);
    expect((await request(app).get(`/service/session/${s.id}`).set(A)).status).toBe(404);
  });
});

describe('digest polling', () => {
  it('stale digest is pending, fresh digest is returned', async () => {
    const { app, services } = makeGApp();
    const s = await create(app);
    expect((await request(app).get(`/service/session/${s.id}/digest`).set(A)).body.data).toEqual({
      pending: true,
    });
    await services.sessions.applySessionDigest(s.id, 'user-a', {
      title: 'Generated',
      description: 'd',
      icon: 'sell',
      summary: 's',
      nextPrompts: [{ text: 't', prompt: 'p' }],
    });
    const stored = await services.sessions.get(s.id, { userId: 'user-a', projectKey: 'p', isAdmin: false });
    const at = stored?.digestUpdatedAt as number;
    const stale = await request(app).get(`/service/session/${s.id}/digest?since=${at}`).set(A);
    expect(stale.body.data).toEqual({ pending: true });
    const fresh = await request(app).get(`/service/session/${s.id}/digest?since=${at - 1}`).set(A);
    expect(fresh.body.data).toMatchObject({
      pending: false,
      digestUpdatedAt: at,
      title: 'Generated',
      icon: 'sell',
      nextPrompts: [{ text: 't', prompt: 'p' }],
    });
  });
});
