/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { tool } from 'ai';
import { z } from 'zod';
import { captureLogs } from '../helpers/log-capture';
import {
  addUsage,
  getAccumulatedUsage,
  getMetadataFromMessage,
} from '../../src/utils/metadata.utils';
import {
  describeStreamError,
  sendSSEError,
} from '../../src/utils/stream.utils';
import { logUnserializableToolSchemas } from '../../src/utils/tool-schema-debug';
import { estimateTokens, sizeOf } from '../../src/utils/token-estimate.utils';
import { extractUrlReferences } from '../../src/utils/url-references';
import { stripSystemMessages } from '../../src/utils/message.utils';

describe('token estimation', () => {
  it('estimates ceil(chars / 4)', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(5)).toBe(2);
    expect(estimateTokens(8)).toBe(2);
  });

  it('sizeOf never throws', () => {
    expect(sizeOf('abcd')).toBe(4);
    expect(sizeOf({ a: 1 })).toBe(7);
    expect(sizeOf(undefined)).toBe(0);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(sizeOf(circular)).toBe(15);
  });
});

describe('usage metadata', () => {
  it('sums top-level usage', () => {
    const total = getAccumulatedUsage([
      {
        metadata: {
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
      },
      {
        metadata: {
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        },
      },
    ]);
    expect(total).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      totalTokens: 33,
    });
  });

  it('includes nested tool output usage', () => {
    const total = getAccumulatedUsage([
      {
        metadata: {
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
        parts: [
          {
            output: {
              metadata: {
                usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
              },
            },
          },
          {
            output: {
              parts: [
                {
                  output: {
                    metadata: {
                      usage: {
                        inputTokens: 2,
                        outputTokens: 2,
                        totalTokens: 4,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(total).toEqual({ inputTokens: 8, outputTokens: 8, totalTokens: 16 });
  });

  it('is zero for no messages and does not log', () => {
    const logs = captureLogs();
    expect(getAccumulatedUsage([])).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    expect(getAccumulatedUsage(undefined).totalTokens).toBe(0);
    logs.stop();
    expect(logs.lines).toHaveLength(0);
  });

  it('keeps only the three counters in stored metadata', () => {
    expect(
      getMetadataFromMessage({
        metadata: {
          usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3, extra: 1 },
        },
      })
    ).toEqual({ metadata: { usage: { inputTokens: 3, totalTokens: 3 } } });
    expect(getMetadataFromMessage({ metadata: {} })).toEqual({});
  });

  it('adds step usage', () => {
    const acc = addUsage({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }, {
      inputTokens: 2,
      outputTokens: 3,
      totalTokens: 5,
    } as Parameters<typeof addUsage>[1]);
    expect(acc.totalTokens).toBe(7);
  });
});

describe('stream utils', () => {
  it('sendSSEError writes the error frame, [DONE] and ends', () => {
    const chunks: string[] = [];
    let ended = false;
    const res = {
      write: (c: string) => {
        chunks.push(c);
        return true;
      },
      end: () => {
        ended = true;
      },
    };
    sendSSEError(res as never, 'x');
    expect(chunks).toEqual([
      'data: {"type":"error","errorText":"x"}\n\n',
      'data: [DONE]\n\n',
    ]);
    expect(ended).toBe(true);
  });

  it('describeStreamError returns the message and logs provider details truncated', () => {
    const logs = captureLogs();
    const error = Object.assign(new Error('bad request'), {
      statusCode: 400,
      responseBody: 'x'.repeat(5000),
    });
    expect(describeStreamError('orchestrator stream error', error)).toBe(
      'bad request'
    );
    expect(describeStreamError('ctx', 'plain')).toBe('Unknown error');
    logs.stop();
    const line =
      logs.lines.find((l) => l.includes('orchestrator stream error')) ?? '';
    expect(line).toContain('"statusCode":400');
    expect(line.includes('x'.repeat(2001))).toBe(false);
    expect(line.includes('x'.repeat(2000))).toBe(true);
  });
});

describe('tool schema debug', () => {
  it('names a tool whose schema cannot be serialised', () => {
    const broken = {
      get inputSchema(): never {
        throw new Error('ref loop');
      },
    };
    const good = tool({
      description: 'ok',
      inputSchema: z.object({ a: z.string() }),
    });
    const logs = captureLogs();
    const names = logUnserializableToolSchemas({ broken, good }, 'test');
    logs.stop();
    expect(names).toEqual(['broken']);
    expect(logs.lines.join('')).toContain('broken');
  });
});

describe('url references', () => {
  it('extracts nested web and service-relative file URLs and ignores data URLs', () => {
    const refs = extractUrlReferences([
      {
        id: 'm1',
        parts: [
          { type: 'file', url: 'https://example.test/a.png' },
          { type: 'file', url: 'data:image/png;base64,AAAA' },
          {
            type: 'tool-imageGeneration',
            output: {
              parts: [
                { type: 'file', url: '/files/s1/b.png' },
                { type: 'file', url: 'data:image/png;base64,BBBB' },
              ],
            },
          },
        ],
      },
    ]);
    expect(refs).toEqual([
      { messageId: 'm1', url: 'https://example.test/a.png' },
      { messageId: 'm1', url: '/files/s1/b.png' },
    ]);
  });
});

describe('stripSystemMessages', () => {
  it('drops system messages and reports the count', () => {
    let dropped = 0;
    const kept = stripSystemMessages(
      [{ role: 'system' }, { role: 'user' }],
      (n) => (dropped = n)
    );
    expect(kept).toEqual([{ role: 'user' }]);
    expect(dropped).toBe(1);
  });
});
