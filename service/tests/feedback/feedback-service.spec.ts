/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import type { SnapshotMessage } from '../../src/persistence/types/feedback';
import type { FeedbackService } from '../../src/services/feedback.service';
import type { RequestUser } from '../../src/types/request.types';
import { MAX_SNAPSHOT_BYTES, reassemble } from '../../src/utils/feedback-snapshot';
import { freshConfig } from '../helpers/env';
import { makeFeedbackHarness, FeedbackHarness } from '../helpers/feedback-app';
import { captureLogs } from '../helpers/log-capture';
import { session, spyGateway } from '../helpers/persistence';

const A: RequestUser = { userId: 'user-a', projectKey: 'p', isAdmin: false };
const B: RequestUser = { userId: 'user-b', projectKey: 'p', isAdmin: false };
const ADMIN: RequestUser = { userId: 'user-admin', projectKey: 'p', isAdmin: true };

beforeEach(() => {
  freshConfig();
});
afterAll(() => resetConfigurationForTests());

const msgs = (n: number, text = 'hello'): SnapshotMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    parts: [{ type: 'text', text: `${text} ${i}` }],
  }));

let counter = 0;
const harness = (wrap?: Parameters<typeof makeFeedbackHarness>[0]): FeedbackHarness => {
  counter = 0;
  const h = makeFeedbackHarness(wrap, {
    now: () => 1_700_000_000_000,
    newId: () => `fb${(counter += 1)}`,
  });
  return h;
};

const seedSession = (h: FeedbackHarness, id: string, userId: string) =>
  h.p.sessions.create(session(id, userId, { title: 'T', createdAt: 5, updatedAt: 6 }));

const stored = async (h: FeedbackHarness, id: string) => {
  const parts = await h.p.feedback.getParts(id);
  if (!parts) throw new Error('feedback missing');
  const payloads: string[] = [];
  parts.chunks.forEach((c) => (payloads[c.index] = c.payload));
  return { record: parts.record, payloads };
};

const submit = (svc: FeedbackService, user: RequestUser, body: object) =>
  svc.submit({ user, body });

describe('FeedbackService.submit', () => {
  it('stores a client transcript for the owner', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const messages = msgs(12);
    const res = await submit(h.feedback, A, { sessionId: 's1', comment: ' bad ', messages });
    expect(res).toEqual({
      status: 201,
      data: {
        id: 'fb1',
        createdAt: 1_700_000_000_000,
        messageCount: 12,
        snapshotSource: 'client',
        truncated: false,
        snapshotBytes: expect.any(Number),
      },
    });
    const { record, payloads } = await stored(h, 'fb1');
    expect(record).toMatchObject({
      userId: 'user-a',
      sessionUserId: 'user-a',
      comment: 'bad',
      sessionTitle: 'T',
      clientMessageCount: 12,
      truncated: false,
    });
    expect(record.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    const out = reassemble({
      payloads,
      expectedChunkCount: record.chunkCount,
      sha256: record.snapshotSha256,
    });
    expect(out.intact).toBe(true);
    expect(out.messages).toEqual(messages);
  });

  it('accepts a missing comment', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const res = await submit(h.feedback, A, { sessionId: 's1', messages: msgs(1) });
    expect(res.status).toBe(201);
    expect((await stored(h, 'fb1')).record.comment).toBe('');
  });

  it.each([undefined, '', '   ', 5])('rejects sessionId %p with 400', async (sessionId) => {
    const h = harness();
    const res = await submit(h.feedback, A, { sessionId });
    expect(res).toEqual({
      status: 400,
      error: 'sessionId is required and must be a non-empty string',
    });
  });

  it('answers 404 for an unknown session, an unsafe id and a foreign session; nothing written', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = harness((gw) => (spy = spyGateway(gw)));
    await seedSession(h, 's1', A.userId);
    spy?.calls.splice(0);
    for (const sessionId of ['nope', 'has space/slash']) {
      expect(await submit(h.feedback, A, { sessionId })).toMatchObject({ status: 404 });
    }
    expect(await submit(h.feedback, B, { sessionId: 's1', messages: msgs(1) })).toEqual({
      status: 404,
      error: 'Session not found',
    });
    expect(spy?.calls.filter((c) => c.startsWith('put'))).toEqual([]);
  });

  it('lets an admin file on another user session, recording both ids', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const logs = captureLogs();
    const res = await submit(h.feedback, ADMIN, { sessionId: 's1', messages: msgs(2) });
    logs.stop();
    expect(res.status).toBe(201);
    const { record } = await stored(h, 'fb1');
    expect(record.userId).toBe('user-admin');
    expect(record.sessionUserId).toBe('user-a');
    const text = logs.lines.join('');
    expect(text).toContain('feedback.submit-on-behalf');
  });

  it('falls back to the stored transcript when messages is empty', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    await h.p.messages.put(
      's1',
      msgs(3).map((m) => ({ id: m.id as string, role: m.role as 'user', parts: m.parts ?? [] }))
    );
    const res = await submit(h.feedback, A, { sessionId: 's1', messages: [] });
    expect(res).toMatchObject({ status: 201, data: { snapshotSource: 'server', messageCount: 3 } });
    const { record, payloads } = await stored(h, 'fb1');
    expect(record.storedMessageCount).toBe(3);
    const out = reassemble({
      payloads,
      expectedChunkCount: record.chunkCount,
      sha256: record.snapshotSha256,
    });
    expect(out.messages.map((m) => m.id)).toEqual(['m0', 'm1', 'm2']);
  });

  it('never tops up a short client array, and warns', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    await h.p.messages.put(
      's1',
      msgs(10).map((m) => ({ id: m.id as string, role: m.role as 'user', parts: m.parts ?? [] }))
    );
    const logs = captureLogs();
    const res = await submit(h.feedback, A, { sessionId: 's1', messages: msgs(3) });
    logs.stop();
    expect(res).toMatchObject({ status: 201, data: { messageCount: 3 } });
    const { record } = await stored(h, 'fb1');
    expect(record).toMatchObject({ clientMessageCount: 3, storedMessageCount: 10 });
    expect(logs.lines.join('')).toContain('shorter than storage');
  });

  it('cuts a long comment and records the truncation', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const res = await submit(h.feedback, A, {
      sessionId: 's1',
      comment: 'x'.repeat(6000),
      messages: msgs(1),
    });
    expect(res).toMatchObject({ status: 201, data: { truncated: true } });
    const { record } = await stored(h, 'fb1');
    expect(record.comment).toHaveLength(5000);
    expect(record.truncations).toEqual([
      expect.objectContaining({ reason: 'comment', path: 'comment', originalBytes: 6000 }),
    ]);
  });

  it('records a stripped inline data URL as a truncation', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const big = `data:image/png;base64,${'A'.repeat(100_000)}`;
    const res = await submit(h.feedback, A, {
      sessionId: 's1',
      messages: [{ id: 'm', role: 'assistant', parts: [{ type: 'file', url: big }] }],
    });
    expect(res).toMatchObject({ status: 201, data: { truncated: true } });
    const { record } = await stored(h, 'fb1');
    expect(record.truncations?.[0]).toMatchObject({ reason: 'inline-data-url' });
  });

  it('stores the system prompt in force, capped at 100 000 bytes', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    await h.p.settings.update((cur) => ({ ...cur, systemPrompt: 'é'.repeat(80_000) }));
    await submit(h.feedback, A, { sessionId: 's1', messages: msgs(1) });
    const { record } = await stored(h, 'fb1');
    expect(Buffer.byteLength(record.systemPrompt ?? '', 'utf8')).toBeLessThanOrEqual(100_000);
    expect(record.truncations?.some((t) => t.reason === 'system-prompt')).toBe(true);
  });

  it('rejects a client snapshot over the cap with the retry hint, writing nothing', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = harness((gw) => (spy = spyGateway(gw)));
    await seedSession(h, 's1', A.userId);
    spy?.calls.splice(0);
    const res = await submit(h.feedback, A, {
      sessionId: 's1',
      messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(9 * 1024 * 1024) }] }],
    });
    expect(res.status).toBe(413);
    if (res.status !== 413) throw new Error('unreachable');
    expect(res.error).toBe('Feedback snapshot is too large');
    expect(res.message).toMatch(/limit is 8388608 bytes\. Submit without the transcript/);
    expect(spy?.calls.filter((c) => c.startsWith('put'))).toEqual([]);
  });

  it('keeps the newest messages of a huge stored session (snapshot-tail)', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const big = 'x'.repeat(1024 * 1024);
    await h.p.messages.put(
      's1',
      Array.from({ length: 20 }, (_, i) => ({
        id: `m${String(i).padStart(2, '0')}`,
        role: 'user' as const,
        parts: [{ type: 'text', text: `${i}:${big}` }],
      }))
    );
    const res = await submit(h.feedback, A, { sessionId: 's1' });
    expect(res).toMatchObject({ status: 201, data: { snapshotSource: 'server', truncated: true } });
    const { record, payloads } = await stored(h, 'fb1');
    expect(record.snapshotBytes).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
    expect(record.truncations?.some((t) => t.reason === 'snapshot-tail')).toBe(true);
    const out = reassemble({
      payloads,
      expectedChunkCount: record.chunkCount,
      sha256: record.snapshotSha256,
    });
    expect(out.intact).toBe(true);
    expect(out.messages.length).toBeLessThan(20);
    expect(out.messages[out.messages.length - 1]?.id).toBe('m19');
  }, 60_000);

  it('writes every chunk before the parent', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    const h = harness((gw) => (spy = spyGateway(gw)));
    await seedSession(h, 's1', A.userId);
    spy?.calls.splice(0);
    await submit(h.feedback, A, {
      sessionId: 's1',
      messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(500_000) }] }],
    });
    const puts = (spy?.calls ?? []).filter((c) => c.startsWith('put'));
    expect(puts.length).toBeGreaterThan(3);
    expect(puts.slice(0, -1).every((c) => c.includes('feedback-snap-fb1'))).toBe(true);
    expect(puts[puts.length - 1]).toBe('put ai-assistant-feedback/fb1');
  });

  it('cleans up and never writes the parent when a chunk write fails', async () => {
    let spy: ReturnType<typeof spyGateway> | undefined;
    let chunkPuts = 0;
    const h = harness(
      (gw) =>
        (spy = spyGateway(gw, {
          onPut: (container) => {
            if (container.includes('feedback-snap')) {
              chunkPuts += 1;
              if (chunkPuts === 3) throw new Error('boom');
            }
          },
        }))
    );
    await seedSession(h, 's1', A.userId);
    await expect(
      submit(h.feedback, A, {
        sessionId: 's1',
        messages: [{ id: 'm', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(900_000) }] }],
      })
    ).rejects.toMatchObject({ statusCode: 500, message: 'Failed to submit feedback' });
    expect(spy?.calls).not.toContain('put ai-assistant-feedback/fb1');
    expect(await h.p.feedback.getParts('fb1')).toBeNull();
    const left = await h.p.gateway.query('ai-assistant-feedback-snap-fb1', { limit: 50 });
    expect(left.results).toEqual([]);
  });

  it('stores the label sanitised and the verified userId', async () => {
    const h = harness();
    await seedSession(h, 's1', B.userId);
    const res = await submit(h.feedback, B, {
      sessionId: 's1',
      messages: msgs(1),
      userLabel: '  <img src=x onerror=1> Bob\u0000  ',
    });
    expect(res.status).toBe(201);
    const { record } = await stored(h, 'fb1');
    expect(record.userId).toBe('user-b');
    expect(record.userLabel).not.toMatch(/[<>]/);
    expect(record.userLabel).not.toContain('\u0000');
    expect(record.userLabel?.length).toBeLessThanOrEqual(120);
    expect(record.userLabel).toBe('img src=x onerror=1 Bob');
  });

  it('drops an empty or non-string label', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    await submit(h.feedback, A, { sessionId: 's1', messages: msgs(1), userLabel: { a: 1 } });
    expect('userLabel' in (await stored(h, 'fb1')).record).toBe(false);
  });

  it('audits with ids only: no comment, label or e-mail in any log line', async () => {
    const h = harness();
    await seedSession(h, 's1', A.userId);
    const logs = captureLogs();
    await submit(h.feedback, A, {
      sessionId: 's1',
      comment: 'SECRET-COMMENT-123',
      userLabel: 'Eve <eve@example.com>',
      messages: msgs(2, 'SECRET-MESSAGE-TEXT'),
    });
    logs.stop();
    const text = logs.lines.join('\n');
    expect(text).toContain('audit.feedback_submitted');
    expect(text).toContain('user-a');
    expect(text).toContain('fb1');
    expect(text).not.toContain('SECRET-COMMENT-123');
    expect(text).not.toContain('SECRET-MESSAGE-TEXT');
    expect(text).not.toContain('Eve');
    expect(text).not.toContain('@');
  });
});
