/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { pipeUIMessageStreamToResponse, type ToolSet } from 'ai';
import { createChatAgent, setChatModelForTests } from '../../src/chat/orchestrator';
import {
  createChatStream,
  type ChatTurnResult,
} from '../../src/chat/stream';
import { RequestBudget } from '../../src/chat/request-budget';
import type { Chunk } from './mock-model';
import { scriptedModel } from './mock-model';
import { makeToolContext } from './stub-tool-source';

export const parseChunks = (body: string): Array<Record<string, unknown>> =>
  body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as Record<string, unknown>);

export interface Served {
  url: string;
  close: () => Promise<void>;
  finished: Promise<ChatTurnResult>;
  budget: RequestBudget;
  /** Fires when the model call receives its abort signal. */
  model: ReturnType<typeof scriptedModel>;
}

/**
 * Serves `createChatStream` over a real HTTP server with a scripted model, the way the chat
 * controller does (awaited pipe, client-gone signal from the socket).
 */
export const serveChat = async (o: {
  turns: Array<Chunk[] | (() => Chunk[] | ReadableStream<Chunk>)>;
  budgetMs?: number;
  reserveMs?: number;
  keepAliveMs?: number;
  tools?: ToolSet;
}): Promise<Served> => {
  const model = scriptedModel(o.turns);
  const clientGone = new AbortController();
  const budget = new RequestBudget(
    Date.now(),
    o.budgetMs ?? 270_000,
    o.reserveMs ?? 30_000,
    clientGone.signal
  );
  // The real agent factory: budget wrapping, wrap-up step and stop conditions included.
  setChatModelForTests(() => ({ model: model.model }));
  const ctx = makeToolContext({ budget });
  const built = createChatAgent({
    ctx,
    instructions: 'test',
    tools: o.tools ?? {},
  });

  let resolveFinished: (turn: ChatTurnResult) => void = () => undefined;
  const finished = new Promise<ChatTurnResult>((resolve) => {
    resolveFinished = resolve;
  });

  const server = http.createServer((_req, response) => {
    response.on('close', () => {
      if (!response.writableEnded) clientGone.abort();
    });
    const stream = createChatStream({
      agent: built.agent,
      messages: [{ role: 'user', content: 'hi' }],
      budget,
      allTools: built.allTools,
      keepAliveMs: o.keepAliveMs,
      onFinish: resolveFinished,
    });
    void pipeUIMessageStreamToResponse({ response, stream }).catch(() => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    budget,
    model,
    finished,
    close: () =>
      new Promise<void>((resolve) => {
        setChatModelForTests(undefined);
        budget.dispose();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};
