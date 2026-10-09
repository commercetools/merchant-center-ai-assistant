/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { offloadMessage } from '../../src/analytics/pipeline/pipeline';
import {
  capRows,
  storeToolResultInBigQuery,
  tableIdFor,
  type StoreDeps,
} from '../../src/analytics/pipeline/store';
import { resetConfigurationForTests } from '../../src/config';
import { sessionTableRef, useGcpEnv } from '../helpers/gcp-env';

const payload = (rows: Record<string, unknown>[], extra = {}) =>
  JSON.stringify({ 'READ ORDERS RESULT': { results: rows, total: 4187, count: rows.length, ...extra } });

const makeDeps = (existing = false) => {
  const calls = { create: [] as unknown[][], insert: [] as number[], added: [] as unknown[] };
  const deps: StoreDeps = {
    tableExists: jest.fn(async () => existing) as never,
    createTable: jest.fn(async (...args: unknown[]) => {
      calls.create.push(args);
      return { tableRef: 'x' };
    }) as never,
    insertRows: jest.fn(async (_ref: string, rows: unknown[]) => {
      calls.insert.push(rows.length);
    }) as never,
    addTemporaryTable: jest.fn(async (...args: unknown[]) => {
      calls.added.push(args);
    }) as never,
  };
  return { deps, calls };
};

beforeEach(() => useGcpEnv());
afterEach(() => {
  resetConfigurationForTests();
  setBigQueryForTests(undefined);
});

const input = (result: string) => ({
  result,
  toolName: 'read_orders',
  toolArgs: '{"limit":2}',
  sessionId: '3f2b8c1e-aaaa-bbbb-cccc-1234567890ab',
  userId: 'u1',
});

describe('storeToolResultInBigQuery', () => {
  it('creates the table with labels, registers it once and reports columns', async () => {
    const { deps, calls } = makeDeps(false);
    const r = await storeToolResultInBigQuery(
      input(payload([{ id: 'a', n: 1 }, { id: 'b', n: 2 }])),
      deps
    );
    const tableId = '3f2b8c1e_aaaa_bbbb_cccc_1234567890ab_read_orders';
    expect(tableIdFor(input('').sessionId, 'read_orders')).toBe(tableId);
    expect(r).toMatchObject({
      tableRef: sessionTableRef(tableId),
      isNewTable: true,
      total: 4187,
      count: 2,
      columns: 'id STRING, n INTEGER',
      droppedRows: 0,
    });
    expect(calls.create[0][2]).toEqual({
      tool_name: 'read_orders',
      session_id: '3f2b8c1e_aaaa_bbbb_cccc_1234567890ab',
    });
    expect(calls.added).toEqual([
      [
        input('').sessionId,
        'u1',
        { tableRef: sessionTableRef(tableId), toolName: 'read_orders', args: '{"limit":2}', columnNames: 'id,n' },
      ],
    ]);
  });

  it('a second call appends and does not register again', async () => {
    const { deps, calls } = makeDeps(true);
    const r = await storeToolResultInBigQuery(input(payload([{ id: 'a' }])), deps);
    expect(r?.isNewTable).toBe(false);
    expect(calls.create).toHaveLength(0);
    expect(calls.added).toHaveLength(0);
    expect(calls.insert).toEqual([1]);
  });

  it('60,000 rows -> 20,000 stored, 40,000 dropped, said in the message', async () => {
    const rows = Array.from({ length: 60_000 }, (_, i) => ({ i }));
    const { deps, calls } = makeDeps(false);
    const r = await storeToolResultInBigQuery(input(payload(rows)), deps);
    expect(calls.insert).toEqual([20_000]);
    expect(r?.droppedRows).toBe(40_000);
    expect(offloadMessage(r!)).toContain('40,000 rows were not stored');
  });

  it('caps by serialized size too', () => {
    const rows = Array.from({ length: 10 }, () => ({ blob: 'x'.repeat(4 * 1024 * 1024) }));
    const { kept, dropped } = capRows(rows);
    expect(kept.length).toBe(4);
    expect(dropped).toBe(6);
  });

  it('nothing tabular or unparsable returns undefined without touching BigQuery', async () => {
    const { deps } = makeDeps(false);
    expect(await storeToolResultInBigQuery(input('not json'), deps)).toBeUndefined();
    expect(await storeToolResultInBigQuery(input('{"X":[]}'), deps)).toBeUndefined();
    expect(deps.tableExists).not.toHaveBeenCalled();
  });
});
