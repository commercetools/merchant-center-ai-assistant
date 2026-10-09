/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';
import { asUser, makeFeedbackHarness } from '../helpers/feedback-app';
import { captureLogs } from '../helpers/log-capture';
import { session, spyGateway } from '../helpers/persistence';

beforeEach(() => {
  freshConfig();
});
afterAll(() => resetConfigurationForTests());

const ADMIN_ADDRESS = 'admin@example.com';
// User B: not an admin. Every forged carrier of an admin identity is attached.
const forgedHeaders = { ...asUser('user-b'), 'x-admin-email': ADMIN_ADDRESS };
const forgedQuery = `userEmail=${encodeURIComponent(ADMIN_ADDRESS)}`;
const forgedBody = { userLabel: ADMIN_ADDRESS, userEmail: ADMIN_ADDRESS };

describe('forged e-mail or label never decides identity', () => {
  it('feedback fetch and backoffice threads stay 403 ADMIN_REQUIRED', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = makeFeedbackHarness((gw) => (spy = spyGateway(gw)));
    const list = await request(h.app).get(`/service/feedback/fetch?${forgedQuery}`).set(forgedHeaders);
    const detail = await request(h.app)
      .get(`/service/feedback/fetch/x?${forgedQuery}`)
      .set(forgedHeaders);
    const threads = await request(h.app)
      .post(`/service/backoffice/threads?${forgedQuery}`)
      .set(forgedHeaders)
      .send({ ...forgedBody, filters: { userId: 'user-a' } });
    for (const res of [list, detail, threads]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ADMIN_REQUIRED');
    }
    expect(spy?.calls).toEqual([]);
  });

  it('is-admin stays false', async () => {
    const h = makeFeedbackHarness();
    const res = await request(h.app)
      .get(`/service/backoffice/is-admin?${forgedQuery}`)
      .set(forgedHeaders);
    expect(res.body.data.isAdmin).toBe(false);
  });

  it('submit for another user session is 404; for the own session it is 201 as the verified user', async () => {
    const h = makeFeedbackHarness();
    await h.p.sessions.create(session('sess-a', 'user-a'));
    await h.p.sessions.create(session('sess-b', 'user-b'));

    const foreign = await request(h.app)
      .post(`/service/feedback/submit?${forgedQuery}`)
      .set(forgedHeaders)
      .send({ sessionId: 'sess-a', comment: 'hi', ...forgedBody });
    expect(foreign.status).toBe(404);
    expect((await h.p.feedback.list({}, 10, 0)).total).toBe(0);

    const own = await request(h.app)
      .post(`/service/feedback/submit?${forgedQuery}`)
      .set(forgedHeaders)
      .send({
        sessionId: 'sess-b',
        comment: 'hi',
        messages: [{ id: 'm', role: 'user', parts: [] }],
        userLabel: `  <b>${ADMIN_ADDRESS}</b>\u0007  ${'z'.repeat(300)}`,
        userEmail: ADMIN_ADDRESS,
      });
    expect(own.status).toBe(201);
    const { items } = await h.p.feedback.list({}, 10, 0);
    expect(items).toHaveLength(1);
    expect(items[0].userId).toBe('user-b');
    // Display text only: sanitised and cut, never an identity.
    expect(items[0].userLabel).not.toMatch(/[<>]/);
    expect(items[0].userLabel).not.toContain('\u0007');
    expect(items[0].userLabel?.length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(items[0])).not.toContain('userEmail');

    // B is still not an admin afterwards.
    const after = await request(h.app).get('/service/feedback/fetch').set(forgedHeaders);
    expect(after.status).toBe(403);
  });

  it('an admin listing ignores a userLabel filter', async () => {
    const h = makeFeedbackHarness();
    await h.p.sessions.create(session('s1', 'user-a', { userLabel: 'x' }));
    await h.p.sessions.create(session('s2', 'user-b'));
    const res = await request(h.app)
      .post('/service/backoffice/threads')
      .set(asUser('adm', true))
      .send({ filters: { userLabel: 'x' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('log hygiene: no comment, label or e-mail reaches a log line', async () => {
    const h = makeFeedbackHarness();
    await h.p.sessions.create(session('sess-b', 'user-b'));
    const logs = captureLogs();
    const res = await request(h.app)
      .post('/service/feedback/submit')
      .set(asUser('user-b'))
      .send({
        sessionId: 'sess-b',
        comment: 'SECRET-COMMENT-123',
        userLabel: 'Eve <eve@example.com>',
        messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: 'SECRET-TEXT' }] }],
      });
    logs.stop();
    expect(res.status).toBe(201);
    const text = logs.lines.join('\n');
    expect(text).not.toContain('SECRET-COMMENT-123');
    expect(text).not.toContain('SECRET-TEXT');
    expect(text).not.toContain('Eve');
    expect(text).not.toContain('@');
  });
});
