/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { tool } from 'ai';
import { z } from 'zod';
import { finish, textTurn, toolCallTurn } from '../helpers/mock-model';
import { parseChunks, serveChat, type Served } from '../helpers/chat-run';

let served: Served | undefined;
afterEach(async () => {
  await served?.close();
  served = undefined;
});

const post = async (url: string) => {
  const res = await fetch(url, { method: 'POST' });
  return { res, text: await res.text() };
};

describe('createChatStream', () => {
  it('streams text deltas, ends with [DONE] and sets the protocol header', async () => {
    served = await serveChat({ turns: [textTurn('hi')] });
    const { res, text } = await post(served.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    const chunks = parseChunks(text);
    expect(
      chunks.some((c) => c.type === 'text-delta' && c.delta === 'hi')
    ).toBe(true);
  });

  it('attaches usage as message metadata on finish-step and reports the turn', async () => {
    served = await serveChat({ turns: [textTurn('hi')] });
    const { text } = await post(served.url);
    const metadata = parseChunks(text).filter(
      (c) =>
        c.type === 'finish-step' ||
        c.type === 'message-metadata' ||
        c.type === 'finish'
    );
    expect(JSON.stringify(metadata)).toContain('"usage"');
    const turn = await served.finished;
    expect(turn.isAborted).toBe(false);
    expect(turn.timeLimit).toBe(false);
    const assistant = turn.messages.find((m) => m.role === 'assistant');
    expect(JSON.stringify(assistant?.parts)).toContain('hi');
    expect(JSON.stringify(assistant?.metadata)).toContain('inputTokens');
  });

  it('runs a tool call and continues with the next step', async () => {
    const echo = tool({
      description: 'echo',
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => `echo:${text}`,
    });
    served = await serveChat({
      turns: [toolCallTurn('echo', { text: 'a' }), textTurn('done')],
      tools: { echo },
    });
    const { text } = await post(served.url);
    const types = parseChunks(text).map((c) => c.type as string);
    expect(types).toContain('tool-output-available');
    expect(types.filter((t) => t === 'start-step').length).toBe(2);
    expect(text).toContain('echo:a');
  });

  it('reports a provider error mid-stream as one error chunk followed by [DONE]', async () => {
    served = await serveChat({
      turns: [
        () => [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'par' },
          {
            type: 'error',
            error: Object.assign(new Error('provider said no'), {
              statusCode: 400,
            }),
          },
          finish('error'),
        ],
      ],
    });
    const { text } = await post(served.url);
    const errors = parseChunks(text).filter((c) => c.type === 'error');
    expect(errors).toHaveLength(1);
    expect(String(errors[0].errorText)).toContain('provider said no');
    expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
  });
});
