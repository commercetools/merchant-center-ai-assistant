/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ToolSet } from 'ai';
import {
  offloadMessage,
  resetPipelineWarningsForTests,
  withToolResultPipeline,
  type PipelineDeps,
} from '../../src/analytics/pipeline/pipeline';
import { GcpNotConfiguredError } from '../../src/gcp/credentials';
import { captureLogs } from '../helpers/log-capture';

const ctx = { sessionId: 'sess-1', userId: 'u1' };
const BIG = { content: [{ type: 'text', text: JSON.stringify({ results: [{ id: 'SECRET-ROW' }], total: 1, count: 1 }) }] };

const makeTools = (...args: [unknown?]): ToolSet => {
  const result = args.length ? args[0] : BIG;
  return ({
    read_orders: {
      description: 'x',
      inputSchema: {},
      execute: async () => result,
      toModelOutput: 'kept',
    },
    no_exec: { description: 'y', inputSchema: {} },
  }) as unknown as ToolSet;
};

const call = async (tools: ToolSet, name = 'read_orders'): Promise<unknown> => {
  const exec = (tools[name] as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute;
  return exec({ limit: 5 }, { messages: [{ role: 'user', content: 'hi' }], toolCallId: 't' });
};

const deps = (over: Partial<PipelineDeps> = {}): PipelineDeps & {
  analyze: jest.Mock;
  store: jest.Mock;
} => ({
  analyze: jest.fn(async () => ({ output: { hasAggregation: false } })),
  store: jest.fn(async () => ({
    tableRef: 'p.d.sess_read_orders',
    isNewTable: true,
    total: 10,
    count: 1,
    columns: 'id STRING',
    droppedRows: 0,
  })),
  ...over,
}) as never;

beforeEach(() => resetPipelineWarningsForTests());

describe('withToolResultPipeline', () => {
  it('returns the original result when the analyzer says no aggregation, without storing', async () => {
    const d = deps();
    const result = await call(withToolResultPipeline(makeTools(), ctx, d));
    expect(result).toBe(BIG);
    expect(d.store).not.toHaveBeenCalled();
  });

  it('keeps the rest of the tool and passes through tools without execute', () => {
    const wrapped = withToolResultPipeline(makeTools(), ctx, deps());
    expect((wrapped.read_orders as unknown as { toModelOutput: string }).toModelOutput).toBe('kept');
    expect(wrapped.no_exec).toBeDefined();
  });

  it('offloads and answers in MCP shape with the columns', async () => {
    const d = deps({ analyze: jest.fn(async () => ({ output: { hasAggregation: true } })) as never });
    const result = (await call(withToolResultPipeline(makeTools(), ctx, d))) as {
      content: { text: string }[];
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('BigQuery table created: p.d.sess_read_orders');
    expect(result.content[0].text).toContain('Columns: id STRING.');
    expect(result.content[0].text).toContain('total number of available data is 10');
    expect(d.store).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'read_orders', sessionId: 'sess-1', userId: 'u1', toolArgs: '{"limit":5}' })
    );
  });

  it('a store failure returns the raw result and logs the size, never row data', async () => {
    const d = deps({
      analyze: jest.fn(async () => ({ output: { hasAggregation: true } })) as never,
      store: jest.fn(async () => {
        throw new Error('insert rejected');
      }) as never,
    });
    const logs = captureLogs();
    const result = await call(withToolResultPipeline(makeTools(), ctx, d));
    logs.stop();
    expect(result).toBe(BIG);
    const text = logs.lines.join('\n');
    expect(text).toContain('returning');
    expect(text).toContain('chars of raw result');
    expect(text).not.toContain('SECRET-ROW');
  });

  it('an analyzer failure never fails the tool call', async () => {
    const d = deps({
      analyze: jest.fn(async () => {
        throw new Error('model down');
      }) as never,
    });
    expect(await call(withToolResultPipeline(makeTools(), ctx, d))).toBe(BIG);
    expect(d.store).not.toHaveBeenCalled();
  });

  it('missing Google credentials: raw result, one warning per process', async () => {
    const d = deps({
      analyze: jest.fn(async () => ({ output: { hasAggregation: true } })) as never,
      store: jest.fn(async () => {
        throw new GcpNotConfiguredError();
      }) as never,
    });
    const logs = captureLogs();
    const tools = withToolResultPipeline(makeTools(), ctx, d);
    await call(tools);
    await call(tools);
    logs.stop();
    expect(logs.lines.filter((l) => l.includes('Offload skipped')).length).toBe(1);
  });

  it('nothing tabular (store returns undefined) returns the raw result', async () => {
    const d = deps({
      analyze: jest.fn(async () => ({ output: { hasAggregation: true } })) as never,
      store: jest.fn(async () => undefined) as never,
    });
    expect(await call(withToolResultPipeline(makeTools(), ctx, d))).toBe(BIG);
  });

  it('a tool that returns undefined is passed through', async () => {
    const d = deps();
    expect(await call(withToolResultPipeline(makeTools(undefined), ctx, d))).toBeUndefined();
    expect(d.analyze).not.toHaveBeenCalled();
  });
});

describe('offloadMessage', () => {
  const base = { tableRef: 'p.d.t', isNewTable: false, droppedRows: 0 };

  it('says appended for an existing table and omits empty parts', () => {
    const text = offloadMessage(base);
    expect(text).toContain('BigQuery table appended data to: p.d.t');
    expect(text).not.toContain('Columns');
    expect(text).not.toContain('not stored');
  });

  it('states how many rows were dropped', () => {
    expect(offloadMessage({ ...base, droppedRows: 40_000 })).toContain('40,000 rows were not stored');
  });
});
