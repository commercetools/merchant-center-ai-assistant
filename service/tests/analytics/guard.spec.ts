/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { runGuardedQuery } from '../../src/analytics/bigquery/queries';
import { GuardRejection } from '../../src/analytics/guard/sql-guard';
import { extractReferencedTables, normaliseRef } from '../../src/analytics/guard/table-refs';
import { resetConfigurationForTests } from '../../src/config';
import { FakeBigQuery } from '../helpers/bigquery-fake';
import { FAKE_DATASET, FAKE_PROJECT, sessionTableRef, useGcpEnv } from '../helpers/gcp-env';

let bq: FakeBigQuery;
const MINE = sessionTableRef('sess_read_orders');
const ref = (tableId: string, projectId = FAKE_PROJECT, datasetId = FAKE_DATASET) => ({
  projectId,
  datasetId,
  tableId,
});

beforeEach(() => {
  useGcpEnv();
  bq = new FakeBigQuery();
  setBigQueryForTests(bq);
});
afterEach(() => {
  setBigQueryForTests(undefined);
  resetConfigurationForTests();
});

const run = (sql: string) => runGuardedQuery(sql, '3f2b8c1e-AAAA', [MINE]);
const realJobs = () => bq.jobs.filter((j) => j.dryRun !== true);

describe('SELECT-only guard through a dry run', () => {
  it('rejects DML without creating a real job', async () => {
    bq.script = { statementType: 'DELETE', referencedTables: [ref('sess_read_orders')] };
    const error = await run('DELETE FROM sess_read_orders WHERE true').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GuardRejection);
    expect((error as Error).message).toMatch(/Only SELECT statements over this conversation's tables/);
    expect(realJobs()).toHaveLength(0);
  });

  it.each(['SCRIPT', 'DROP_TABLE', 'EXPORT_DATA', 'CALL', 'CREATE_TABLE', 'INSERT'])('rejects %s', async (type) => {
    bq.script = { statementType: type, referencedTables: [] };
    await expect(run('SELECT 1; DROP TABLE x')).rejects.toBeInstanceOf(GuardRejection);
    expect(realJobs()).toHaveLength(0);
  });

  it('rejects a foreign table (another project or dataset)', async () => {
    bq.script = { statementType: 'SELECT', referencedTables: [ref('users', 'other-project', 'public_data')] };
    await expect(run('SELECT * FROM `other-project.public_data.users`')).rejects.toBeInstanceOf(GuardRejection);
    expect(realJobs()).toHaveLength(0);
  });

  it("rejects another session's table in the same dataset", async () => {
    bq.script = { statementType: 'SELECT', referencedTables: [ref('other_session_read_orders')] };
    await expect(run('SELECT * FROM other_session_read_orders')).rejects.toBeInstanceOf(GuardRejection);
  });

  it('allows SELECT 1 and a SELECT over a session table', async () => {
    bq.script = { statementType: 'SELECT', referencedTables: [], rows: [{ f0_: 1 }] };
    expect((await run('SELECT 1')).rows).toEqual([{ f0_: 1 }]);
    bq.script = { statementType: 'SELECT', referencedTables: [ref('sess_read_orders')], rows: [{ n: 2 }] };
    expect((await run('SELECT COUNT(*) n FROM sess_read_orders')).rows).toEqual([{ n: 2 }]);
  });

  it('empty or NUL queries are rejected before any BigQuery call', async () => {
    await expect(run('   ')).rejects.toBeInstanceOf(GuardRejection);
    await expect(run('SELECT 1\u0000')).rejects.toBeInstanceOf(GuardRejection);
    expect(bq.jobs).toHaveLength(0);
  });

  it('a dry-run failure is returned as the BigQuery error', async () => {
    bq.script = { dryRunError: new Error('Unrecognized name: orderNumber at [1:12]') };
    await expect(run('SELECT orderNumber FROM sess_read_orders')).rejects.toThrow('Unrecognized name');
  });
});

describe('caps on the real job', () => {
  beforeEach(() => {
    bq.script = { statementType: 'SELECT', referencedTables: [ref('sess_read_orders')], rows: [{ a: 1 }] };
  });

  it('sets maximumBytesBilled, jobTimeoutMs, location, defaultDataset and labels (dry run too)', async () => {
    await run('SELECT a FROM sess_read_orders');
    const [dry, real] = bq.jobs;
    expect(dry.dryRun).toBe(true);
    expect(dry.maximumBytesBilled).toBe('200000000');
    expect(real).toMatchObject({
      maximumBytesBilled: '200000000',
      jobTimeoutMs: 60_000,
      location: 'us-central1',
      defaultDataset: { projectId: FAKE_PROJECT, datasetId: FAKE_DATASET },
      labels: { app: 'ai-assistant', session_id: '3f2b8c1e-aaaa' },
    });
  });

  it('12,000 rows: 500 returned, truncated, totalRows 12000', async () => {
    bq.script.rows = Array.from({ length: 12_000 }, (_, i) => ({ i }));
    bq.script.totalRows = '12000';
    const r = await run('SELECT i FROM sess_read_orders');
    expect(r.rows).toHaveLength(500);
    expect(r.truncated).toBe(true);
    expect(r.totalRows).toBe(12_000);
  });

  it('rows beyond 256 KB are dropped from the end', async () => {
    bq.script.rows = Array.from({ length: 100 }, () => ({ blob: 'x'.repeat(10_000) }));
    bq.script.totalRows = '100';
    const r = await run('SELECT blob FROM sess_read_orders');
    expect(JSON.stringify(r.rows).length).toBeLessThanOrEqual(256 * 1024);
    expect(r.rows.length).toBeLessThan(100);
    expect(r.truncated).toBe(true);
  });

  it('small results are not truncated and are JSON-safe', async () => {
    bq.script.rows = [{ d: { value: '2026-01-01' }, n: 1 }];
    const r = await run('SELECT d FROM sess_read_orders');
    expect(r.truncated).toBe(false);
    expect(r.rows).toEqual([{ d: { value: '2026-01-01' }, n: 1 }]);
  });

  it('a billing-limit failure surfaces as the BigQuery error', async () => {
    bq.script.runError = new Error('Query exceeded limit for bytes billed: 200000000');
    await expect(run('SELECT a FROM sess_read_orders')).rejects.toThrow('bytes billed');
  });
});

describe('fallback extractor when a dry run omits referencedTables (OQ-L1)', () => {
  const noRefs = (type = 'SELECT') => {
    bq.script = { statementType: type, referencedTables: undefined, rows: [{ ok: 1 }] };
  };

  it('allows unqualified, dataset-qualified and fully qualified session tables', async () => {
    noRefs();
    await expect(run('SELECT * FROM sess_read_orders')).resolves.toBeDefined();
    await expect(run('SELECT * FROM aiassistant.sess_read_orders')).resolves.toBeDefined();
    await expect(run(`SELECT * FROM \`${MINE}\``)).resolves.toBeDefined();
  });

  it('rejects foreign and other-session tables', async () => {
    noRefs();
    await expect(run('SELECT * FROM other_session')).rejects.toBeInstanceOf(GuardRejection);
    await expect(run('SELECT * FROM `other.pub.users`')).rejects.toBeInstanceOf(GuardRejection);
  });

  it('rejects comma joins it cannot follow', async () => {
    noRefs();
    await expect(run('SELECT * FROM sess_read_orders a, other b')).rejects.toBeInstanceOf(GuardRejection);
  });

  it('still rejects non-SELECT statements', async () => {
    noRefs('DELETE');
    await expect(run('DELETE FROM sess_read_orders WHERE true')).rejects.toBeInstanceOf(GuardRejection);
  });
});

describe('extractReferencedTables', () => {
  it('ignores comments, strings, CTE names, UNNEST, sub-queries and EXTRACT(... FROM col)', () => {
    const sql = `
      -- FROM hidden_in_comment
      WITH recent AS (SELECT * FROM t1 /* FROM block */)
      SELECT EXTRACT(YEAR FROM createdAt) y, 'FROM in string' s, x
      FROM recent
      JOIN (SELECT 1 a) sub ON TRUE
      JOIN UNNEST(arr) AS u ON TRUE
      LEFT JOIN \`p.d.t2\` USING (id)`;
    const { refs, unsupported } = extractReferencedTables(sql);
    expect(refs).toEqual(['t1', 'p.d.t2']);
    expect(unsupported).toBe(false);
  });

  it('flags comma joins', () => {
    expect(extractReferencedTables('SELECT * FROM a, b').unsupported).toBe(true);
    expect(extractReferencedTables('SELECT * FROM a AS x, b').unsupported).toBe(true);
    expect(extractReferencedTables('SELECT * FROM a WHERE x IN (1,2)').unsupported).toBe(false);
  });
});

describe('normaliseRef', () => {
  const d = { projectId: 'p', datasetId: 'd' };
  it('expands one and two part references and keeps case', () => {
    expect(normaliseRef('t', d)).toBe('p.d.t');
    expect(normaliseRef('x.T', d)).toBe('p.x.T');
    expect(normaliseRef('`a.b.c`', d)).toBe('a.b.c');
    expect(normaliseRef('a.b.c.d', d)).toBeUndefined();
    expect(normaliseRef('a..c', d)).toBeUndefined();
  });
});
