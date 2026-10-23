/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { asUser, makeGApp, resetGApp } from '../helpers/g-app';

/**
 * The browser must never decide who is an administrator or who owns a session. Every value
 * below is attacker-controlled; the outcome must be exactly what a plain non-admin sees.
 */

const OWNER = asUser('owner-1', false);
const ATTACKER = asUser('attacker-1', false);
const ADMIN_ADDRESS = 'admin@example.test';
const forged = {
  'x-admin-email': ADMIN_ADDRESS,
  'x-admin-user-id': 'admin-1',
};

afterEach(resetGApp);

describe('forged identity grants nothing', () => {
  it('PUT /system-prompt and PUT /tool-call-logs stay 403 ADMIN_REQUIRED, nothing stored', async () => {
    const { app, persistence } = makeGApp();
    const prompt = await request(app)
      .put(`/service/system-prompt?userEmail=${ADMIN_ADDRESS}&userId=admin-1`)
      .set(ATTACKER)
      .set(forged)
      .send({ systemPrompt: 'pwned', userEmail: ADMIN_ADDRESS, userLabel: ADMIN_ADDRESS });
    const mode = await request(app)
      .put(`/service/tool-call-logs?userEmail=${ADMIN_ADDRESS}`)
      .set(ATTACKER)
      .set(forged)
      .send({ mode: 'none', userEmail: ADMIN_ADDRESS, userLabel: 'admin-1' });
    expect(prompt.status).toBe(403);
    expect(prompt.body.code).toBe('ADMIN_REQUIRED');
    expect(mode.status).toBe(403);
    expect(mode.body.code).toBe('ADMIN_REQUIRED');
    const settings = await persistence.settings.get();
    expect(settings.systemPrompt).toBe('');
    expect(settings.toolCallLogs).toBe('all');
  });

  it("another user's session is 404 even with the owner's address forged everywhere", async () => {
    const { app } = makeGApp();
    const created = await request(app).post('/service/session').set(OWNER).send({ userLabel: 'owner@example.test' });
    const id = created.body.data.id as string;
    const res = await request(app)
      .get(`/service/session/${id}?userEmail=owner@example.test&userId=owner-1`)
      .set(ATTACKER)
      .set({ 'x-admin-email': 'owner@example.test' });
    expect(res.status).toBe(404);
  });

  it('GET /session/all?userEmail=<someone else> lists only the caller\'s sessions', async () => {
    const { app } = makeGApp();
    await request(app).post('/service/session').set(OWNER).send({});
    const mine = await request(app).post('/service/session').set(ATTACKER).send({});
    const res = await request(app)
      .get('/service/session/all?userEmail=owner@example.test&userId=owner-1')
      .set(ATTACKER)
      .set({ 'x-admin-email': 'owner@example.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([mine.body.data.id]);
  });

  it('a forged userLabel in the create body is stored as text but owns nothing', async () => {
    const { app } = makeGApp();
    const res = await request(app)
      .post('/service/session')
      .set(ATTACKER)
      .send({ userLabel: 'owner-1', userId: 'owner-1', userEmail: 'owner@example.test' });
    expect(res.body.data.userId).toBe('attacker-1');
    const ownerList = await request(app).get('/service/session/all').set(OWNER);
    expect(ownerList.body.data).toEqual([]);
  });
});
