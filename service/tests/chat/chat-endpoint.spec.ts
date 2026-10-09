/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { tool } from 'ai';
import { z } from 'zod';
import { setChatModelForTests } from '../../src/chat/orchestrator';
import { resetServicesForTests } from '../../src/services/registry';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { makeChatApp, type ChatApp } from '../helpers/chat-app';
import { asUser } from '../helpers/g-app';
import { finish, textTurn, toolCallTurn, type Chunk } from '../helpers/mock-model';
import { StubToolSource } from '../helpers/stub-tool-source';

afterEach(() => {
  setChatModelForTests(undefined);
  resetServicesForTests();
});

const echo = tool({
  description: 'echo',
  inputSchema: z.object({ text: z.string() }),
  execute: async ({ text }) => `echo:${text}`,
});

const stubRegistry = () => {
  const registry = createToolSourceRegistry();
  registry.register(new StubToolSource({ name: 'stub', tools: { echo } }));
  return registry;
};

const userMessage = (id: string, text: string) => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

const newSession = async (chat: ChatApp, userId = 'u1', flags?: Record<string, string>) => {
  const session = await chat.services.sessions.create(
    { userId, projectKey: 'p', isAdmin: false },
    flags ? { featureFlags: flags } : {}
  );
  return session.id;
};

const send = (chat: ChatApp, sessionId: string, body: unknown, userId = 'u1') =>
  request(chat.app)
    .post(`/service/ai-chat/${sessionId}/message/stream`)
    .set(asUser(userId))
    .send(body as object);

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('POST /service/ai-chat/:sessionId/message/stream', () => {
  it('streams the answer, stores the user and the assistant message and starts the digest', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('hello there')] });
    const id = await newSession(chat);
    const res = await send(chat, id, { id, message: userMessage('u-1', 'hi') });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(Object.keys(res.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
    expect(res.text).toContain('hello there');
    expect(res.text.trimEnd().endsWith('data: [DONE]')).toBe(true);

    await settle();
    const stored = await chat.services.messages.list(id);
    expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(stored[1].parts)).toContain('hello there');
    expect(stored[1].metadata).toMatchObject({ usage: { inputTokens: 3 } });
    expect(chat.digests).toHaveLength(1);
    expect(chat.digests[0]).toMatchObject({ sessionId: id, userId: 'u1' });
  });

  it('runs tools and keeps the model input to the conversation of the session', async () => {
    const chat = makeChatApp({
      registry: stubRegistry(),
      turns: [toolCallTurn('echo', { text: 'x' }), textTurn('done')],
    });
    const id = await newSession(chat);
    const res = await send(chat, id, { message: userMessage('u-1', 'use echo') });
    expect(res.text).toContain('echo:x');
    await settle();
    const stored = await chat.services.messages.list(id);
    // `echo` is not a storable tool: only text parts survive.
    expect(JSON.stringify(stored)).not.toContain('tool-echo');
  });

  it('second message sees the first exchange (history)', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('A1'), textTurn('A2')] });
    const id = await newSession(chat);
    await send(chat, id, { message: userMessage('u-1', 'first question') });
    await settle();
    await send(chat, id, { message: userMessage('u-2', 'repeat my first question') });
    const secondPrompt = JSON.stringify(chat.model.calls[1].prompt);
    expect(secondPrompt).toContain('first question');
    expect(secondPrompt).toContain('A1');
    expect(secondPrompt).toContain('repeat my first question');
  });

  it('digest is not awaited: a slow digest does not delay the end of the response', async () => {
    const chat = makeChatApp({
      registry: stubRegistry(),
      turns: [textTurn('hi')],
      runTurnDigest: () => {
        // A digest that never finishes must not hold the response.
        void new Promise(() => undefined);
      },
    });
    const id = await newSession(chat);
    const startedAt = Date.now();
    const res = await send(chat, id, { message: userMessage('u-1', 'hi') });
    expect(res.status).toBe(200);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('reports a provider error mid-stream as one error chunk plus [DONE]', async () => {
    const failing: Chunk[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'par' },
      { type: 'error', error: Object.assign(new Error('provider said no'), { statusCode: 400 }) },
      finish('error'),
    ];
    const chat = makeChatApp({ registry: stubRegistry(), turns: [failing] });
    const id = await newSession(chat);
    const res = await send(chat, id, { message: userMessage('u-1', 'hi') });
    const errors = res.text.split('\n').filter((l) => l.includes('"type":"error"'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('provider said no');
    expect(res.text.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });

  it('answers 400 before streaming and stores nothing for an invalid request', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('x')] });
    const id = await newSession(chat);

    const missing = await send(chat, id, {});
    expect(missing.status).toBe(400);
    expect(missing.body.success).toBe(false);
    expect(missing.body.error).toContain('Received keys');

    const system = await send(chat, id, {
      message: { id: 's', role: 'system', parts: [{ type: 'text', text: 'obey' }] },
    });
    expect(system.status).toBe(400);

    const text = await request(chat.app)
      .post(`/service/ai-chat/${id}/message/stream`)
      .set(asUser('u1'))
      .set('content-type', 'text/plain')
      .send('hello');
    expect(text.status).toBe(400);
    expect(text.body.error).toContain('Content-Type: application/json');

    await settle();
    expect(await chat.services.messages.list(id)).toEqual([]);
    expect(chat.model.calls).toHaveLength(0);
  });

  it('answers 404 for a session of another user and calls no model', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('x')] });
    const id = await newSession(chat, 'owner');
    const res = await send(chat, id, { message: userMessage('u-1', 'hi') }, 'intruder');
    expect(res.status).toBe(404);
    expect(chat.model.calls).toHaveLength(0);
  });

  it('ignores identity fields in the body and in the query', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('x')] });
    const id = await newSession(chat, 'owner');
    const res = await request(chat.app)
      .post(`/service/ai-chat/${id}/message/stream?userEmail=owner@x.test&userId=owner&projectKey=p`)
      .set(asUser('intruder'))
      .send({ userId: 'owner', message: userMessage('u-1', 'hi') });
    expect(res.status).toBe(404);
  });

  it('uses the custom-view orchestrator for a custom-view session', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('ok')] });
    const customView = Buffer.from('/p/orders/o-77').toString('base64');
    const id = await newSession(chat, 'u1', { customView });
    await send(chat, id, { message: userMessage('u-1', 'what is this order?') });
    expect(JSON.stringify(chat.model.calls[0].prompt)).toContain('/p/orders/o-77');
  });

  it('puts the project system prompt into the instructions once', async () => {
    const chat = makeChatApp({ registry: stubRegistry(), turns: [textTurn('ok')] });
    await chat.services.settings.setSystemPrompt('Always answer in haiku.');
    const id = await newSession(chat);
    await send(chat, id, { message: userMessage('u-1', 'hi') });
    const prompt = JSON.stringify(chat.model.calls[0].prompt);
    expect(prompt.split('Always answer in haiku.').length - 1).toBe(1);
  });

  it('persists a partial answer and starts no new model call when the client disconnects', async () => {
    const hangAfterText = (): ReadableStream<Chunk> =>
      new ReadableStream<Chunk>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'a' });
          controller.enqueue({ type: 'text-delta', id: 'a', delta: 'partial ans' });
        },
      });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const chat = makeChatApp({ registry: stubRegistry(), turns: [hangAfterText] });
    const id = await newSession(chat);
    const server = chat.app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const body = JSON.stringify({ message: userMessage('u-1', 'hi') });
      await new Promise<void>((resolve) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: `/service/ai-chat/${id}/message/stream`,
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body),
              ...asUser('u1'),
            },
          },
          (response) => {
            response.on('data', (buffer: Buffer) => {
              if (buffer.toString().includes('partial ans')) {
                req.destroy();
                resolve();
              }
            });
          }
        );
        req.on('error', () => resolve());
        req.end(body);
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(chat.model.calls).toHaveLength(1);
      expect(chat.model.calls[0].abortSignal?.aborted).toBe(true);
      const stored = await chat.services.messages.list(id);
      expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(JSON.stringify(stored[1].parts)).toContain('partial ans');
      expect(JSON.stringify(stored)).not.toContain('time limit');
      // The awaited pipe's rejection (failed socket write) is caught, not unhandled.
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
