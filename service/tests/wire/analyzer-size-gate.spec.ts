/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, jest, test } from '@jest/globals';
import type { ModelMessage } from 'ai';
import {
  analyzeQueryTask,
  type AnalyzeQueryDeps,
} from '../../src/agents/analyzer.agent';
import { sizeOf } from '../../src/utils/token-estimate.utils';

/**
 * The analyzer's size gate decides an offload WITHOUT a model call. The tests that expect no
 * model call pass a `generate` that fails the test if it is reached.
 */

const MESSAGES: ModelMessage[] = [
  { role: 'user', content: 'how many orders were placed last month?' },
];

/** Over 10^5 estimated tokens at 4 chars/token. */
const OVERSIZED_CHARS = 500_000;

const neverCalled = (): AnalyzeQueryDeps => ({
  generate: async () => {
    throw new Error('the model must not be called');
  },
});

describe('analyzer size gate', () => {
  test('an oversized result offloads without asking the model', async () => {
    const result = await analyzeQueryTask(
      {
        messages: MESSAGES,
        toolCallParams: {
          args: {},
          toolName: 'read_orders',
          result: { anything: 'the gate never looks at this' },
          resultChars: OVERSIZED_CHARS,
        },
      },
      neverCalled()
    );
    expect(result.output.hasAggregation).toBe(true);
  });

  test('a result that cannot be serialized does not throw', async () => {
    const circular: Record<string, unknown> = { tool: 'read_carts' };
    circular.self = circular;
    const result = await analyzeQueryTask(
      {
        messages: MESSAGES,
        toolCallParams: {
          args: {},
          toolName: 'read_carts',
          result: circular,
          resultChars: OVERSIZED_CHARS,
        },
      },
      neverCalled()
    );
    expect(result.output.hasAggregation).toBe(true);
  });

  test('falls back to measuring the result when the caller supplies no size', async () => {
    const result = await analyzeQueryTask(
      {
        messages: MESSAGES,
        toolCallParams: {
          args: {},
          toolName: 'read_carts',
          result: { padding: 'x'.repeat(OVERSIZED_CHARS) },
        },
      },
      neverCalled()
    );
    expect(result.output.hasAggregation).toBe(true);
  });

  /**
   * `sizeOf` cannot serialize a circular value, so it falls back to `String(value)`
   * (`'[object Object]'`, 15 chars) however large the value really is. Recorded because the
   * number is not a measurement: a future caller that drops `resultChars` inherits the blind
   * spot silently.
   */
  test('an unserializable result with no supplied size measures as small', () => {
    const circular: Record<string, unknown> = {
      padding: 'x'.repeat(OVERSIZED_CHARS),
    };
    circular.self = circular;
    expect(sizeOf(circular)).toBe('[object Object]'.length);
  });

  test('no usable history means no offload, and no model call', async () => {
    const result = await analyzeQueryTask(
      {
        messages: [],
        toolCallParams: {
          args: {},
          toolName: 'read_orders',
          result: {},
          resultChars: OVERSIZED_CHARS,
        },
      },
      neverCalled()
    );
    expect(result.output.hasAggregation).toBe(false);
  });

  test('a history of only assistant tool turns means no offload and no model call', async () => {
    const result = await analyzeQueryTask(
      {
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolCallId: 'c', toolName: 't', input: {} },
            ],
          },
        ],
        toolCallParams: {
          args: {},
          toolName: 't',
          result: {},
          resultChars: 10,
        },
      },
      neverCalled()
    );
    expect(result.output.hasAggregation).toBe(false);
  });
});

describe('analyzer model path', () => {
  test('asks the model for small results and returns its verdict', async () => {
    const generate = jest.fn(async () => ({ hasAggregation: true }));
    const result = await analyzeQueryTask(
      {
        messages: MESSAGES,
        toolCallParams: {
          args: { a: 1 },
          toolName: 'read_orders',
          result: {},
          resultChars: 1000,
        },
      },
      { generate }
    );
    expect(result).toEqual({ output: { hasAggregation: true } });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('the messages sent to the model end with a user message', async () => {
    let sent: ModelMessage[] = [];
    await analyzeQueryTask(
      {
        messages: [
          { role: 'user', content: 'list orders' },
          { role: 'assistant', content: 'here they are' },
        ],
        toolCallParams: {
          args: {},
          toolName: 'read_orders',
          result: {},
          resultChars: 10,
        },
      },
      {
        generate: async ({ messages }) => {
          sent = messages;
          return { hasAggregation: false };
        },
      }
    );
    expect(sent[sent.length - 1].role).toBe('user');
  });

  test('uses at most the last 10 messages and names the tool in the prompt', async () => {
    const many: ModelMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }));
    let seen: { system: string; messages: ModelMessage[] } | undefined;
    await analyzeQueryTask(
      {
        messages: [...many, { role: 'user', content: 'last' }],
        toolCallParams: {
          args: {},
          toolName: 'read_orders',
          result: {},
          resultChars: 10,
        },
      },
      {
        generate: async (input) => {
          seen = input;
          return { hasAggregation: false };
        },
      }
    );
    expect(seen?.messages.length).toBeLessThanOrEqual(10);
    expect(seen?.system).toContain('read_orders');
  });
});
