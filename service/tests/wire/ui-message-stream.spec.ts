/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import http from 'node:http';
import request from 'supertest';
import { createUIMessageStream, pipeUIMessageStreamToResponse, tool } from 'ai';
import { z } from 'zod';
import { parseChunks as parseServed, serveChat } from '../helpers/chat-run';
import { textTurn, toolCallTurn } from '../helpers/mock-model';

/**
 * The UI message stream chunk vocabulary accepted by the deployed chat clients.
 *
 * This is a WIRE CONTRACT, not an SDK detail. `@ai-sdk/react`'s transport validates
 * every chunk against a zod union and does `if (!chunk.success) throw chunk.error`,
 * so a chunk type a client does not know kills the stream mid-response rather than
 * being ignored. ai v7 adds `custom`, `reasoning-file`, `reset-step` and
 * `tool-approval-response` to this list - emitting any of them to a client still on
 * the v6 line is an outage, and one that only triggers when a provider or tool
 * happens to populate the new shape.
 *
 * Keep this list in sync with the OLDEST `ai` version used by `mc-app` and `mc-view-app`
 * (both apps pin one version). Widen it only once every client can parse the new type.
 */
const CLIENT_ACCEPTED_CHUNK_TYPES = new Set([
  'text-start',
  'text-delta',
  'text-end',
  'reasoning-start',
  'reasoning-delta',
  'reasoning-end',
  'error',
  'tool-input-start',
  'tool-input-delta',
  'tool-input-available',
  'tool-input-error',
  'tool-approval-request',
  'tool-output-available',
  'tool-output-error',
  'tool-output-denied',
  'source-url',
  'source-document',
  'file',
  'start-step',
  'finish-step',
  'start',
  'finish',
  'abort',
  'message-metadata',
]);

const isAccepted = (type: string) =>
  CLIENT_ACCEPTED_CHUNK_TYPES.has(type) || type.startsWith('data-');

/** Serve one UI message stream over HTTP exactly the way the chat controller does. */
const serveStream = (
  execute: Parameters<typeof createUIMessageStream>[0]['execute']
) =>
  http.createServer((_req, response) => {
    pipeUIMessageStreamToResponse({
      response,
      stream: createUIMessageStream({ execute, onError: (e) => String(e) }),
    });
  });

const parseChunks = (body: string) =>
  body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload));

describe('UI message stream wire contract', () => {
  test('emits SSE framing and the protocol header the clients expect', async () => {
    const server = serveStream(({ writer }) => {
      writer.write({ type: 'start', messageId: 'm1' });
      writer.write({ type: 'text-start', id: 't1' });
      writer.write({ type: 'text-delta', id: 't1', delta: 'hello' });
      writer.write({ type: 'text-end', id: 't1' });
      writer.write({ type: 'finish' });
    });

    const res = await request(server).post('/');

    expect(res.headers['content-type']).toContain('text/event-stream');
    // Clients do not read this header, but a change in it signals a protocol bump.
    expect(res.headers['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(res.text.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });

  test('every emitted chunk type is one the deployed clients can parse', async () => {
    const server = serveStream(({ writer }) => {
      writer.write({ type: 'start', messageId: 'm1' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: 't1' });
      writer.write({ type: 'text-delta', id: 't1', delta: 'hi' });
      writer.write({ type: 'text-end', id: 't1' });
      writer.write({
        type: 'file',
        url: 'https://example.test/a.png',
        mediaType: 'image/png',
      });
      writer.write({ type: 'data-custom-payload', data: { ok: true } });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish' });
    });

    const chunks = parseChunks((await request(server).post('/')).text);
    expect(chunks.length).toBeGreaterThan(0);

    const rejected = chunks
      .map((c) => c.type as string)
      .filter((type) => !isAccepted(type));
    expect(rejected).toEqual([]);
  });

  test('surfaces execute failures as an in-band error chunk, not a dropped stream', async () => {
    const server = serveStream(() => {
      throw new Error('boom');
    });

    const chunks = parseChunks((await request(server).post('/')).text);
    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(
      chunks.map((c) => c.type as string).filter((t) => !isAccepted(t))
    ).toEqual([]);
  });
});

describe('real chat stream', () => {
  test('a turn with a tool call emits only chunk types the clients can parse', async () => {
    const echo = tool({
      description: 'echo',
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => text,
    });
    const served = await serveChat({
      turns: [toolCallTurn('echo', { text: 'a' }), textTurn('done')],
      tools: { echo },
    });
    try {
      const text = await (await fetch(served.url, { method: 'POST' })).text();
      const types = parseServed(text).map((c) => c.type as string);
      expect(types).toContain('tool-output-available');
      // `custom`, `reasoning-file`, `reset-step` and `tool-approval-response` would break
      // clients that predate ai v7.
      expect(types.filter((type) => !isAccepted(type))).toEqual([]);
    } finally {
      await served.close();
    }
  });

  test('a time-limited turn emits only accepted chunk types', async () => {
    const served = await serveChat({
      turns: [() => new ReadableStream({ start: () => undefined })],
      budgetMs: 600,
      reserveMs: 200,
    });
    try {
      const text = await (await fetch(served.url, { method: 'POST' })).text();
      const types = parseServed(text).map((c) => c.type as string);
      expect(types).toContain('data-turn-status');
      expect(types.filter((type) => !isAccepted(type))).toEqual([]);
    } finally {
      await served.close();
    }
  });
});
