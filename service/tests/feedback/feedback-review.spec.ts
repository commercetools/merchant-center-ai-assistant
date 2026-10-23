/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import type { SnapshotMessage } from '../../src/persistence/types/feedback';
import { FeedbackService } from '../../src/services/feedback.service';
import type { RequestUser } from '../../src/types/request.types';
import { freshConfig } from '../helpers/env';
import { asUser, FeedbackHarness, makeFeedbackHarness } from '../helpers/feedback-app';
import { captureLogs } from '../helpers/log-capture';
import { session, spyGateway } from '../helpers/persistence';

const ADMIN: RequestUser = { userId: 'user-admin', projectKey: 'p', isAdmin: true };

beforeEach(() => {
  freshConfig();
});
afterAll(() => resetConfigurationForTests());

const msgs = (n: number): SnapshotMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: 'user' as const,
    parts: [{ type: 'text', text: `text ${i}` }],
  }));

const t = 1_700_000_000_000;
const seedFeedback = async (
  h: FeedbackHarness,
  id: string,
  userId: string,
  at: number,
  messages: SnapshotMessage[] = msgs(3)
) => {
  const sessionId = `s-${id}`;
  await h.p.sessions.create(session(sessionId, userId));
  const f = makeFeedbackHarnessAt(h, at, id);
  await f.submit({
    user: { userId, projectKey: 'p', isAdmin: false },
    body: { sessionId, comment: `c-${id}`, messages },
  });
};

// A service sharing the harness stores but with a chosen clock and id.
const makeFeedbackHarnessAt = (h: FeedbackHarness, at: number, id: string) =>
  new FeedbackService({
    sessions: h.p.sessions,
    messages: h.p.messages,
    feedback: h.p.feedback,
    settings: h.p.settings,
    now: () => at,
    newId: () => id,
  });

describe('feedback review', () => {
  it('lists newest first with pagination and no transcript', async () => {
    const h = makeFeedbackHarness();
    await seedFeedback(h, 'f1', 'u1', t);
    await new Promise((r) => setTimeout(r, 5));
    await seedFeedback(h, 'f2', 'u2', t + 1);
    const res = await request(h.app).get('/service/feedback/fetch').set(asUser('adm', true));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.map((i: { id: string }) => i.id)).toEqual(['f2', 'f1']);
    expect(res.body.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
    for (const item of res.body.data) {
      expect(item).not.toHaveProperty('messages');
      expect(item).not.toHaveProperty('systemPrompt');
      expect(item).not.toHaveProperty('disabledTools');
      expect(item).not.toHaveProperty('temporaryTables');
      expect(item.comment).toMatch(/^c-/);
    }
  });

  it('clamps limit and offset', async () => {
    const h = makeFeedbackHarness();
    const res = await request(h.app)
      .get('/service/feedback/fetch?limit=500&offset=-5')
      .set(asUser('adm', true));
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ limit: 100, offset: 0 });
    const bad = await request(h.app)
      .get('/service/feedback/fetch?limit=abc&offset=zzz')
      .set(asUser('adm', true));
    expect(bad.body.pagination).toMatchObject({ limit: 20, offset: 0 });
  });

  it('filters by author user id exactly', async () => {
    const h = makeFeedbackHarness();
    await seedFeedback(h, 'f1', 'u1', t);
    await seedFeedback(h, 'f2', 'u2', t);
    const res = await request(h.app)
      .get('/service/feedback/fetch?authorUserId=u1')
      .set(asUser('adm', true));
    expect(res.body.data.map((i: { userId: string }) => i.userId)).toEqual(['u1']);
  });

  it('filters by a date window on the record creation time', async () => {
    const h = makeFeedbackHarness();
    const times: number[] = [];
    for (let i = 1; i <= 5; i += 1) {
      await seedFeedback(h, `f${i}`, 'u1', t + i);
      times.push(Date.now());
      await new Promise((r) => setTimeout(r, 15));
    }
    // The store filters on the object's server createdAt; use the wall-clock marks.
    const res = await request(h.app)
      .get(`/service/feedback/fetch?createdAtAfter=${times[0] + 5}&createdAtBefore=${times[2] + 5}`)
      .set(asUser('adm', true));
    expect(res.body.data.map((i: { id: string }) => i.id).sort()).toEqual(['f2', 'f3']);
  });

  it('returns the detail with the reassembled transcript', async () => {
    const h = makeFeedbackHarness();
    const messages = [
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(500_000) }] },
      ...msgs(2),
    ] as SnapshotMessage[];
    await seedFeedback(h, 'f1', 'u1', t, messages);
    const res = await request(h.app).get('/service/feedback/fetch/f1').set(asUser('adm', true));
    expect(res.status).toBe(200);
    expect(res.body.data.snapshotIntact).toBe(true);
    expect(res.body.data.messages).toEqual(messages);
    expect(res.body.data.chunkCount).toBeGreaterThan(2);
  });

  it('reports a corrupt snapshot with 200 and a placeholder', async () => {
    const h = makeFeedbackHarness();
    await seedFeedback(
      h,
      'f1',
      'u1',
      t,
      [{ id: 'a', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(500_000) }] }]
    );
    await h.p.gateway.delete('ai-assistant-feedback-snap-f1', 'f1-001');
    const res = await request(h.app).get('/service/feedback/fetch/f1').set(asUser('adm', true));
    expect(res.status).toBe(200);
    expect(res.body.data.snapshotIntact).toBe(false);
    expect(JSON.stringify(res.body.data.messages)).toContain('[unreadable snapshot:');
  });

  it('answers 404 for an unknown or unsafe id', async () => {
    const h = makeFeedbackHarness();
    for (const id of ['nope', 'a.b']) {
      const res = await request(h.app).get(`/service/feedback/fetch/${id}`).set(asUser('adm', true));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Feedback not found' });
    }
  });

  it('refuses a non-admin with 403 ADMIN_REQUIRED and reads no store', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = makeFeedbackHarness((gw) => (spy = spyGateway(gw)));
    const logs = captureLogs();
    for (const path of ['/service/feedback/fetch', '/service/feedback/fetch/f1']) {
      const res = await request(h.app).get(path).set(asUser('u1'));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ADMIN_REQUIRED');
    }
    logs.stop();
    expect(spy?.calls).toEqual([]);
    expect(logs.lines.join('')).toContain('"outcome":"denied"');
  });

  it('audits list and detail reads by admin user id only', async () => {
    const h = makeFeedbackHarness();
    await seedFeedback(h, 'f1', 'u1', t);
    const logs = captureLogs();
    await request(h.app).get('/service/feedback/fetch?authorUserId=u1').set(asUser('adm-1', true));
    await request(h.app).get('/service/feedback/fetch/f1').set(asUser('adm-1', true));
    logs.stop();
    const text = logs.lines.join('\n');
    expect(text).toContain('feedback.listed');
    expect(text).toContain('feedback.read');
    expect(text).toContain('adm-1');
    expect(text).not.toContain('@');
    expect(text).not.toContain('c-f1');
  });

  it('service.list/get work without HTTP too', async () => {
    const h = makeFeedbackHarness();
    await seedFeedback(h, 'f1', 'u1', t);
    expect((await h.feedback.list({ user: ADMIN })).pagination.total).toBe(1);
    expect((await h.feedback.get({ user: ADMIN, feedbackId: 'f1' })).status).toBe(200);
  });
});
