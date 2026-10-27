/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { GuardRejection } from '../../src/analytics/guard/sql-guard';
import { createQueryTool, type AggregateDataResult, type QueryToolDeps } from '../../src/analytics/tools/query';
import { createTableInfoTool } from '../../src/analytics/tools/table';
import { resetConfigurationForTests } from '../../src/config';
import type { TemporaryTable } from '../../src/types/chat.types';
import { sessionTableRef, useGcpEnv } from '../helpers/gcp-env';

/*
 * A failed query must come back with the columns that DO exist (`Unrecognized name:
 * orderNumber` was seen in three turns; the model overrode a prompt that already listed the
 * columns).
 */
const ORDERS_REF = sessionTableRef('sess_read_orders');
const CARTS_REF = sessionTableRef('sess_read_carts');
const table = (tableRef: string): TemporaryTable => ({ tableRef, toolName: 't', args: '{}', columnNames: 'id' });

const ORDERS_SCHEMA = {
  fields: [
    { name: 'id', type: 'STRING' },
    { name: 'createdAt', type: 'TIMESTAMP' },
    { name: 'orderState', type: 'STRING' },
    { name: 'totalPrice', type: 'JSON' },
  ],
};

beforeEach(() => useGcpEnv());
afterEach(() => {
  resetConfigurationForTests();
  setBigQueryForTests(undefined);
});

const makeTool = (over: Partial<QueryToolDeps> & { registered?: TemporaryTable[] } = {}) => {
  const deps = {
    sessionId: 's1',
    tables: jest.fn(async () => over.registered ?? [table(ORDERS_REF)]),
    runGuardedQuery: jest.fn(async () => ({ rows: [{ id: 'ord-1' }], totalRows: 1, truncated: false })),
    getTableMetadata: jest.fn(async () => ({ schema: ORDERS_SCHEMA }) as never),
    ...over,
  } as unknown as QueryToolDeps & { runGuardedQuery: jest.Mock; getTableMetadata: jest.Mock };
  const tool = createQueryTool(deps);
  const run = (tableRefs: string[], query = 'SELECT orderNumber FROM t') =>
    (tool.execute as unknown as (i: unknown, o: unknown) => Promise<AggregateDataResult>)(
      { tableRefs, query },
      { toolCallId: 'c', messages: [] }
    );
  return { deps, run };
};

describe('query_aggregated_data failure', () => {
  it('reports the real columns of the referenced table, names and types', async () => {
    const { run } = makeTool({
      runGuardedQuery: jest.fn(async () => {
        throw new Error('Unrecognized name: orderNumber at [1:12]');
      }) as never,
    });
    const r = (await run([ORDERS_REF])) as Extract<AggregateDataResult, { success: false }>;
    expect(r.success).toBe(false);
    expect(r.tableColumns?.[ORDERS_REF]).toBe('id STRING, createdAt TIMESTAMP, orderState STRING, totalPrice JSON');
    expect(r.tableColumns?.[ORDERS_REF]).not.toContain('orderNumber');
    expect(r.error).toContain('Unrecognized name: orderNumber');
    expect(r.hint).toMatch(/does not exist/i);
    expect(r.hint).toMatch(/optional/i);
  });

  it('describes every referenced table, not just the first', async () => {
    const getTableMetadata = jest
      .fn()
      .mockImplementationOnce(async () => ({ schema: ORDERS_SCHEMA }))
      .mockImplementationOnce(async () => ({ schema: { fields: [{ name: 'cartState', type: 'STRING' }] } }));
    const { run } = makeTool({
      registered: [table(ORDERS_REF), table(CARTS_REF)],
      runGuardedQuery: jest.fn(async () => {
        throw new Error('Unrecognized name: x');
      }) as never,
      getTableMetadata: getTableMetadata as never,
    });
    const r = (await run([ORDERS_REF, CARTS_REF])) as Extract<AggregateDataResult, { success: false }>;
    expect(Object.keys(r.tableColumns ?? {})).toEqual([ORDERS_REF, CARTS_REF]);
    expect(r.tableColumns?.[CARTS_REF]).toBe('cartState STRING');
  });

  it('a metadata failure does not replace the real error', async () => {
    const { run } = makeTool({
      runGuardedQuery: jest.fn(async () => {
        throw new Error('Unrecognized name: orderNumber at [1:12]');
      }) as never,
      getTableMetadata: jest.fn(async () => {
        throw new Error('table not found');
      }) as never,
    });
    const r = (await run([ORDERS_REF])) as Extract<AggregateDataResult, { success: false }>;
    expect(r.error).toContain('Unrecognized name: orderNumber');
    expect(r.tableColumns).toBeUndefined();
    expect(r.hint).not.toMatch(/tableColumns/);
    expect(r.hint).toMatch(/Check that table names/);
  });

  it('a table with no schema is omitted rather than reported empty', async () => {
    const { run } = makeTool({
      runGuardedQuery: jest.fn(async () => {
        throw new Error('x');
      }) as never,
      getTableMetadata: jest.fn(async () => ({ schema: { fields: [] } })) as never,
    });
    expect(((await run([ORDERS_REF])) as { tableColumns?: unknown }).tableColumns).toBeUndefined();
  });
});

describe('the lookup is only paid for on failure', () => {
  it('a successful query fetches no metadata and returns rows', async () => {
    const { run, deps } = makeTool();
    const r = await run([ORDERS_REF], 'SELECT id FROM t');
    expect(r).toMatchObject({ success: true, rowCount: 1, data: [{ id: 'ord-1' }], tableRefs: [ORDERS_REF] });
    expect(deps.getTableMetadata).not.toHaveBeenCalled();
  });

  it('no tableRefs short-circuits before touching BigQuery', async () => {
    const { run, deps } = makeTool();
    expect((await run([])).success).toBe(false);
    expect(deps.runGuardedQuery).not.toHaveBeenCalled();
    expect(deps.tables).not.toHaveBeenCalled();
  });
});

describe('session binding', () => {
  it('passes only this session\'s tables (full refs) and id to the guard', async () => {
    const { run, deps } = makeTool({ registered: [table(ORDERS_REF)] });
    await run([ORDERS_REF]);
    expect(deps.runGuardedQuery).toHaveBeenCalledWith('SELECT orderNumber FROM t', 's1', [ORDERS_REF]);
  });

  it('a guard rejection answers success:false with the allowed refs and no metadata calls', async () => {
    const { run, deps } = makeTool({
      runGuardedQuery: jest.fn(async () => {
        throw new GuardRejection('Table x is not a table of this conversation.', 'Use only listed refs.');
      }) as never,
    });
    const r = (await run([ORDERS_REF], 'SELECT * FROM x')) as Extract<AggregateDataResult, { success: false }>;
    expect(r).toMatchObject({ success: false, availableTableRefs: [ORDERS_REF], hint: 'Use only listed refs.' });
    expect(deps.getTableMetadata).not.toHaveBeenCalled();
  });

  it('flags truncated results with totalRows', async () => {
    const { run } = makeTool({
      runGuardedQuery: jest.fn(async () => ({ rows: [{ a: 1 }], totalRows: 12_000, truncated: true })) as never,
    });
    expect(await run([ORDERS_REF])).toMatchObject({ truncated: true, totalRows: 12_000 });
  });

  it('unreadable session tables fail informedly', async () => {
    const { run } = makeTool({
      tables: jest.fn(async () => {
        throw new Error('Session not found');
      }) as never,
    });
    expect(await run([ORDERS_REF])).toMatchObject({ success: false, availableTableRefs: [] });
  });
});

describe('get_table_info', () => {
  const info = (registered: TemporaryTable[]) => {
    const getTableMetadata = jest.fn(async (_ref: string) => ({
      schema: ORDERS_SCHEMA,
      numRows: '5',
      numBytes: '100',
      creationTime: '1',
      lastModifiedTime: '2',
    }));
    const tool = createTableInfoTool({ tables: async () => registered, getTableMetadata: getTableMetadata as never });
    const run = (tableRef: string) =>
      (tool.execute as unknown as (i: unknown, o: unknown) => Promise<Record<string, unknown>>)(
        { tableRef },
        { toolCallId: 'c', messages: [] }
      );
    return { run, getTableMetadata };
  };

  it('answers for the short and the full reference of a registered table', async () => {
    const { run, getTableMetadata } = info([table(ORDERS_REF)]);
    expect(await run('aiassistant.sess_read_orders')).toMatchObject({ success: true, numRows: '5' });
    expect(await run(ORDERS_REF)).toMatchObject({ success: true });
    expect(getTableMetadata).toHaveBeenCalledWith(ORDERS_REF);
  });

  it('rejects another project, another dataset and another session\'s table without a BigQuery call', async () => {
    const { run, getTableMetadata } = info([table(ORDERS_REF)]);
    for (const ref of ['other-project.aiassistant.sess_read_orders', 'public_data.users', sessionTableRef('other_session_read_orders')]) {
      const r = await run(ref);
      expect(r).toMatchObject({ success: false, availableTableRefs: [ORDERS_REF] });
    }
    expect(getTableMetadata).not.toHaveBeenCalled();
  });
});
