/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { setChatModelForTests } from '../../src/chat/orchestrator';
import { MAX_FOLLOWERS_PER_TURN } from '../../src/chat/stream-resume.controller';
import { MAX_TURN_BYTES, turnRegistry } from '../../src/chat/turn-buffer';
import { resetServicesForTests } from '../../src/services/registry';
import { createToolSourceRegistry } from '../../src/tool-sources/registry';
import { makeChatApp, type ChatApp } from '../helpers/chat-app';
import { asUser } from '../helpers/g-app';
import { textTurn, usage, type Chunk } from '../helpers/mock-model';

afterEach(() => {
  setChatModelForTests(undefined);
  resetServicesForTests();
  turnRegistry.clear();
});

const userMessage = (id: string, text: string) => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

const newSession = async (chat: ChatApp, userId = 'u1') =>
  (
    await chat.services.sessions.create(
      { userId, projectKey: 'p', isAdmin: false },
      {}
    )
  ).id;

const path = (id: string) => `/service/ai-chat/${id}/message/stream`;

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

/** A model turn the test finishes by hand, so a reconnect can land in the middle of it. */
const controlledTurn = () => {
  let controller!: ReadableStreamDefaultController<Chunk>;
  const stream = new ReadableStream<Chunk>({
    start(c) {
      controller = c;
      c.enqueue({ type: 'stream-start', warnings: [] });
      c.enqueue({ type: 'text-start', id: 'a' });
      c.enqueue({ type: 'text-delta', id: 'a', delta: 'first part. ' });
    },
  });
  return {
    stream,
    finish: () => {
      controller.enqueue({ type: 'text-delta', id: 'a', delta: 'second part.' });
      controller.enqueue({ type: 'text-end', id: 'a' });
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usage(),
      } as Chunk);
      controller.close();
    },
  };
};

type Live = { text: () => string; status: number; ended: Promise<void>; destroy: () => void };

const open = (
  port: number,
  method: string,
  url: string,
  userId: string,
  body?: unknown
): Promise<Live> =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: url,
        method,
        headers: {
          ...(payload
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              }
            : {}),
          ...asUser(userId),
        },
      },
      (res) => {
        let received = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (received += chunk));
        const ended = new Promise<void>((done) => {
          res.on('end', () => done());
          res.on('close', () => done());
          res.on('error', () => done());
        });
        resolve({
          text: () => received,
          status: res.statusCode ?? 0,
          ended,
          destroy: () => req.destroy(),
        });
      }
    );
    req.on('error', reject);
    req.end(payload);
  });

const withServer = async (
  chat: ChatApp,
  run: (port: number) => Promise<void>
): Promise<void> => {
  const server = chat.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

describe('GET /service/ai-chat/:sessionId/message/stream (reattach)', () => {
  it('answers 204 when the session has no running or recent turn', async () => {
    const chat = makeChatApp({ registry: createToolSourceRegistry(), turns: [] });
    const id = await newSession(chat);
    const res = await request(chat.app).get(path(id)).set(asUser('u1'));
    expect(res.status).toBe(204);
  });

  it('replays a finished turn from its first frame with the same message id', async () => {
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [textTurn('hello there')],
    });
    const id = await newSession(chat);
    const sent = await request(chat.app)
      .post(path(id))
      .set(asUser('u1'))
      .send({ id, message: userMessage('u-1', 'hi') });
    expect(sent.status).toBe(200);
    await settle();

    const replay = await request(chat.app).get(path(id)).set(asUser('u1'));
    expect(replay.status).toBe(200);
    expect(replay.headers['content-type']).toContain('text/event-stream');
    expect(replay.headers['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(replay.headers['cache-control']).toBe('no-cache, no-transform');

    const frames = (text: string) => text.split('\n\n').filter(Boolean);
    expect(frames(replay.text)).toEqual(frames(sent.text));
    const start = JSON.parse(frames(replay.text)[0].slice(6));
    expect(start.type).toBe('start');
    expect(start.messageId).toBe(JSON.parse(frames(sent.text)[0].slice(6)).messageId);
    expect(replay.text.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });

  it('replays only the turn it is asked for', async () => {
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [textTurn('first answer')],
    });
    const id = await newSession(chat);
    const sent = await request(chat.app)
      .post(path(id))
      .set(asUser('u1'))
      .send({ id, message: userMessage('u-1', 'hi') });
    await settle();
    const messageId = JSON.parse(sent.text.split('\n\n')[0].slice(6)).messageId as string;

    const right = await request(chat.app)
      .get(`${path(id)}?messageId=${messageId}`)
      .set(asUser('u1'));
    expect(right.status).toBe(200);
    expect(right.text).toContain('first answer');

    // The browser is showing another turn: this one must not be put under it.
    const wrong = await request(chat.app)
      .get(`${path(id)}?messageId=some-other-turn`)
      .set(asUser('u1'));
    expect(wrong.status).toBe(204);
    expect(wrong.text).toBe('');
  });

  it('answers 204 for a turn too large to keep, while the original request still gets it all', async () => {
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [textTurn('x'.repeat(MAX_TURN_BYTES + 1024 * 1024))],
    });
    const id = await newSession(chat);
    const sent = await request(chat.app)
      .post(path(id))
      .set(asUser('u1'))
      .send({ id, message: userMessage('u-1', 'hi') });
    expect(sent.status).toBe(200);
    expect(sent.text.length).toBeGreaterThan(MAX_TURN_BYTES);
    expect(sent.text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    await settle();

    const replay = await request(chat.app).get(path(id)).set(asUser('u1'));
    expect(replay.status).toBe(204);
  });

  it('serves a limited number of followers per turn', async () => {
    const turn = controlledTurn();
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [() => turn.stream],
    });
    const id = await newSession(chat);
    await withServer(chat, async (port) => {
      const original = await open(port, 'POST', path(id), 'u1', {
        id,
        message: userMessage('u-1', 'hi'),
      });
      await settle(200);

      const followers: Live[] = [];
      for (let i = 0; i < MAX_FOLLOWERS_PER_TURN; i += 1) {
        const follower = await open(port, 'GET', path(id), 'u1');
        expect(follower.status).toBe(200);
        followers.push(follower);
      }
      const over = await open(port, 'GET', path(id), 'u1');
      expect(over.status).toBe(204);

      // A follower that goes away makes room again.
      followers[0].destroy();
      await settle(100);
      const again = await open(port, 'GET', path(id), 'u1');
      expect(again.status).toBe(200);

      turn.finish();
      await Promise.all([original.ended, again.ended, ...followers.slice(1).map((f) => f.ended)]);
    });
  });

  it('does not keep a follower for a reattach the browser gave up on before the session loaded', async () => {
    const turn = controlledTurn();
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [() => turn.stream],
    });
    const id = await newSession(chat);
    await withServer(chat, async (port) => {
      const original = await open(port, 'POST', path(id), 'u1', {
        id,
        message: userMessage('u-1', 'hi'),
      });
      await settle(200);

      // Loading the session takes a moment, long enough for the browser to hang up first.
      const sessions = chat.services.sessions;
      const load = sessions.get.bind(sessions);
      jest.spyOn(sessions, 'get').mockImplementation(async (...args) => {
        await settle(150);
        return load(...args);
      });
      const request = [
        `GET ${path(id)} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        ...Object.entries(asUser('u1')).map(([name, value]) => `${name}: ${value}`),
        'Connection: close',
        '',
        '',
      ].join('\r\n');
      const hangUp = () =>
        new Promise<void>((resolve) => {
          const socket = net.connect(port, '127.0.0.1', () => {
            socket.write(request);
            setTimeout(() => {
              socket.destroy();
              resolve();
            }, 30);
          });
        });
      await Promise.all(Array.from({ length: MAX_FOLLOWERS_PER_TURN }, hangUp));
      await settle(300);

      // None of them is left holding a place, or the frames still to come.
      expect(turnRegistry.get(id)?.followerCount).toBe(0);
      const legitimate = await open(port, 'GET', path(id), 'u1');
      expect(legitimate.status).toBe(200);

      turn.finish();
      await Promise.all([original.ended, legitimate.ended]);
    });
  });

  it('does not leak a turn to another user', async () => {
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [textTurn('private')],
    });
    const id = await newSession(chat, 'u1');
    await request(chat.app)
      .post(path(id))
      .set(asUser('u1'))
      .send({ id, message: userMessage('u-1', 'hi') });
    await settle();

    const other = await request(chat.app).get(path(id)).set(asUser('u2'));
    expect(other.status).toBe(404);
    expect(other.text).not.toContain('private');
  });

  it('follows a turn that is still running and ends with it', async () => {
    const turn = controlledTurn();
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [() => turn.stream],
    });
    const id = await newSession(chat);
    await withServer(chat, async (port) => {
      const original = await open(port, 'POST', path(id), 'u1', {
        id,
        message: userMessage('u-1', 'hi'),
      });
      await settle(200);
      expect(original.text()).toContain('first part.');

      // The gateway cut the browser's connection, but the service never saw the close (the
      // measured behaviour), so the original request is still open here. The browser
      // reattaches with a second request.
      const reattached = await open(port, 'GET', path(id), 'u1');
      expect(reattached.status).toBe(200);
      await settle(100);
      expect(reattached.text()).toContain('first part.');
      expect(reattached.text()).not.toContain('second part.');
      expect(reattached.text()).not.toContain('[DONE]');

      turn.finish();
      await reattached.ended;
      await original.ended;
      expect(reattached.text()).toContain('second part.');
      expect(reattached.text().trimEnd().endsWith('data: [DONE]')).toBe(true);
      expect(original.text()).toContain('second part.');
    });
  });
});

describe('DELETE /service/ai-chat/:sessionId/message/stream (stop)', () => {
  it('stops the running model run and is idempotent', async () => {
    const turn = controlledTurn();
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [() => turn.stream],
    });
    const id = await newSession(chat);
    await withServer(chat, async (port) => {
      const original = await open(port, 'POST', path(id), 'u1', {
        id,
        message: userMessage('u-1', 'hi'),
      });
      await settle(200);
      expect(chat.model.calls[0].abortSignal?.aborted).toBe(false);

      const stopped = await open(port, 'DELETE', path(id), 'u1');
      expect(stopped.status).toBe(200);
      await stopped.ended;
      expect(JSON.parse(stopped.text())).toEqual({ success: true, message: 'Stopped' });
      await settle(150);
      expect(chat.model.calls[0].abortSignal?.aborted).toBe(true);

      // A stop is not a time-limit end: the answer is closed without that notice.
      await original.ended;
      expect(original.text()).toContain('"type":"abort"');
      expect(original.text()).not.toMatch(/time.limit/i);
      expect(original.text()).not.toContain('data-turn-status');

      const again = await open(port, 'DELETE', path(id), 'u1');
      expect(again.status).toBe(200);
    });
  });

  it('says what it did, and stops nothing once the turn is over', async () => {
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [textTurn('done already')],
    });
    const id = await newSession(chat);
    await request(chat.app)
      .post(path(id))
      .set(asUser('u1'))
      .send({ id, message: userMessage('u-1', 'hi') });
    await settle();

    const res = await request(chat.app).delete(path(id)).set(asUser('u1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Nothing to stop' });
  });

  it('stops only the turn it is told to stop', async () => {
    const turn = controlledTurn();
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [() => turn.stream],
    });
    const id = await newSession(chat);
    await withServer(chat, async (port) => {
      const original = await open(port, 'POST', path(id), 'u1', {
        id,
        message: userMessage('u-1', 'hi'),
      });
      await settle(200);
      const messageId = JSON.parse(original.text().split('\n\n')[0].slice(6)).messageId as string;

      // A stop that belongs to another turn of the session (one that ended, or one that
      // was replaced) must not reach this one.
      const stale = await open(port, 'DELETE', `${path(id)}?messageId=an-older-turn`, 'u1');
      await stale.ended;
      expect(JSON.parse(stale.text())).toEqual({ success: true, message: 'Nothing to stop' });
      await settle(100);
      expect(chat.model.calls[0].abortSignal?.aborted).toBe(false);

      const stop = await open(port, 'DELETE', `${path(id)}?messageId=${messageId}`, 'u1');
      await stop.ended;
      expect(JSON.parse(stop.text())).toEqual({ success: true, message: 'Stopped' });
      await settle(150);
      expect(chat.model.calls[0].abortSignal?.aborted).toBe(true);
      original.destroy();
    });
  });

  it('does not stop another user’s turn', async () => {
    const turn = controlledTurn();
    const chat = makeChatApp({
      registry: createToolSourceRegistry(),
      turns: [() => turn.stream],
    });
    const id = await newSession(chat, 'u1');
    await withServer(chat, async (port) => {
      const original = await open(port, 'POST', path(id), 'u1', {
        id,
        message: userMessage('u-1', 'hi'),
      });
      await settle(200);
      const foreign = await open(port, 'DELETE', path(id), 'u2');
      expect(foreign.status).toBe(404);
      await settle(100);
      expect(chat.model.calls[0].abortSignal?.aborted).toBe(false);
      turn.finish();
      await original.ended;
    });
  });
});
