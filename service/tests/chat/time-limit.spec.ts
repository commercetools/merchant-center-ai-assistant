/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import http from 'node:http';
import { afterEach, describe, expect, it } from '@jest/globals';
import { tool } from 'ai';
import { z } from 'zod';
import { TIME_LIMIT_NOTICE } from '../../src/chat/constants';
import { captureLogs } from '../helpers/log-capture';
import { textTurn, toolCallTurn, type Chunk } from '../helpers/mock-model';
import { parseChunks, serveChat, type Served } from '../helpers/chat-run';

let served: Served | undefined;
afterEach(async () => {
  await served?.close();
  served = undefined;
});

const hang = (): ReadableStream<Chunk> =>
  new ReadableStream<Chunk>({ start: () => undefined });

/** A model that streams one text delta and then never finishes (a hung provider mid-answer). */
const hangAfterText = (): ReadableStream<Chunk> =>
  new ReadableStream<Chunk>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: 'a' });
      controller.enqueue({ type: 'text-delta', id: 'a', delta: 'partial ans' });
    },
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('hard deadline', () => {
  it('ends a never-resolving model within the budget with the notice and [DONE]', async () => {
    const logs = captureLogs();
    served = await serveChat({ turns: [hang], budgetMs: 1500, reserveMs: 500 });
    const startedAt = Date.now();
    const res = await fetch(served.url, { method: 'POST' });
    const text = await res.text();
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(2000);
    expect(text).toContain('The time limit for a single reply was reached');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    const chunks = parseChunks(text);
    expect(chunks.some((c) => c.type === 'data-turn-status')).toBe(true);
    const terminal = chunks.findIndex(
      (c) => c.type === 'finish' || c.type === 'abort'
    );
    expect(terminal).toBeGreaterThan(-1);
    expect(chunks.findIndex((c) => c.type === 'text-delta')).toBeLessThan(
      terminal
    );

    const turn = await served.finished;
    logs.stop();
    expect(turn.timeLimit).toBe(true);
    const assistant = turn.messages.find((m) => m.role === 'assistant');
    expect(JSON.stringify(assistant?.parts)).toContain(
      TIME_LIMIT_NOTICE.slice(0, 40)
    );
    expect(JSON.stringify(assistant?.parts)).toContain('time-limit');
    expect(logs.lines.join('')).toContain('chat.time_limit_reached');
  });

  it('closes a text part that was cut mid-sentence before the notice', async () => {
    served = await serveChat({
      turns: [hangAfterText],
      budgetMs: 1500,
      reserveMs: 500,
    });
    const text = await (await fetch(served.url, { method: 'POST' })).text();
    const chunks = parseChunks(text);
    const endOfPartial = chunks.findIndex(
      (c) => c.type === 'text-end' && c.id === 'a'
    );
    const noticeStart = chunks.findIndex(
      (c) => c.type === 'text-start' && c.id === 'time-limit'
    );
    expect(endOfPartial).toBeGreaterThan(-1);
    expect(endOfPartial).toBeLessThan(noticeStart);
    const turn = await served.finished;
    const assistant = turn.messages.find((m) => m.role === 'assistant');
    expect(JSON.stringify(assistant?.parts)).toContain('partial ans');
  });

  it('logs exactly one "chat turn finished" line with the documented fields', async () => {
    const logs = captureLogs();
    served = await serveChat({ turns: [textTurn('hi')] });
    await (await fetch(served.url, { method: 'POST' })).text();
    await served.finished;
    logs.stop();
    const lines = logs.lines.filter((l) => l.includes('chat turn finished'));
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry).toMatchObject({
      steps: 1,
      timeLimit: false,
      phase: 'normal',
    });
    expect(typeof entry.elapsedMs).toBe('number');
  });
});

describe('client disconnect', () => {
  it('aborts the model run within 100 ms, writes no notice and still finishes the turn', async () => {
    served = await serveChat({
      turns: [hangAfterText],
      budgetMs: 60_000,
      reserveMs: 10_000,
    });
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        served?.url ?? '',
        { method: 'POST' },
        (response) => {
          response.on('data', (buffer: Buffer) => {
            received.push(buffer.toString());
            // First chunk seen: hang up.
            request.destroy();
            resolve();
          });
        }
      );
      request.on('error', () => resolve());
      request.end();
      setTimeout(() => reject(new Error('no first chunk')), 5000).unref();
    });

    await wait(100);
    const signal = served.model.calls[0]?.abortSignal;
    expect(signal?.aborted).toBe(true);
    expect(served.budget.timedOut()).toBe(false);
    expect(received.join('')).not.toContain('time limit');

    const turn = await served.finished;
    expect(turn.timeLimit).toBe(false);
  });
});

describe('soft deadline and wrap-up', () => {
  it('forces a text-only step after the soft deadline when the model wants another tool call', async () => {
    const slow = tool({
      description: 'slow',
      inputSchema: z.object({}),
      execute: async (_input, { abortSignal }) =>
        new Promise((resolve) => {
          const done = setTimeout(() => resolve('late'), 5000);
          abortSignal?.addEventListener('abort', () => {
            clearTimeout(done);
            resolve('aborted');
          });
        }),
    });
    served = await serveChat({
      turns: [
        toolCallTurn('slow', {}),
        toolCallTurn('slow', {}, 'call-2'),
        textTurn('summary'),
      ],
      tools: { slow },
      budgetMs: 8000,
      reserveMs: 6000,
    });
    const text = await (await fetch(served.url, { method: 'POST' })).text();
    expect(text).toContain('Stopped: time limit reached');
    const calls = served.model.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[calls.length - 1].toolChoice).toEqual({ type: 'none' });
    expect(text).toContain('summary');
    expect(text).not.toContain('time limit for a single reply');
  }, 15000);
});

describe('keep-alive', () => {
  it('writes a transient data-keepalive while nothing else is emitted, and never stores it', async () => {
    served = await serveChat({
      turns: [hangAfterText],
      budgetMs: 1500,
      reserveMs: 500,
      keepAliveMs: 100,
    });
    const text = await (await fetch(served.url, { method: 'POST' })).text();
    const keepalives = parseChunks(text).filter(
      (c) => c.type === 'data-keepalive'
    );
    expect(keepalives.length).toBeGreaterThanOrEqual(1);
    expect(keepalives[0].transient).toBe(true);

    const turn = await served.finished;
    expect(JSON.stringify(turn.messages)).not.toContain('keepalive');
  });
});
