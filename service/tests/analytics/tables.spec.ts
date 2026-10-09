/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  DatasetUnavailableError,
  ensureDataset,
  resetEnsureDatasetForTests,
} from '../../src/analytics/bigquery/ensure-dataset';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import {
  createNewTable,
  deleteTable,
  ForeignTableError,
  insertRows,
  parseTableRef,
  resetTablesForTests,
  tableExists,
} from '../../src/analytics/bigquery/tables';
import { resetConfigurationForTests } from '../../src/config';
import { captureLogs } from '../helpers/log-capture';
import { FakeBigQuery, googleError } from '../helpers/bigquery-fake';
import { FAKE_DATASET, FAKE_PROJECT, sessionTableRef, useGcpEnv } from '../helpers/gcp-env';

let bq: FakeBigQuery;

beforeEach(() => {
  useGcpEnv();
  bq = new FakeBigQuery();
  setBigQueryForTests(bq);
  resetEnsureDatasetForTests();
  resetTablesForTests();
});
afterEach(() => {
  setBigQueryForTests(undefined);
  resetConfigurationForTests();
});

const schema = [{ name: 'id', type: 'STRING' as const, mode: 'NULLABLE' as const }];

describe('parseTableRef', () => {
  it('accepts dataset.table and project.dataset.table of this deployment', () => {
    expect(parseTableRef(`${FAKE_DATASET}.t1`)).toEqual({ projectId: FAKE_PROJECT, datasetId: FAKE_DATASET, tableId: 't1' });
    expect(parseTableRef(sessionTableRef('t1')).tableId).toBe('t1');
    expect(parseTableRef('`' + sessionTableRef('t1') + '`').tableId).toBe('t1');
  });

  it('rejects another project, another dataset and malformed references', () => {
    expect(() => parseTableRef('other-project.aiassistant.t')).toThrow(ForeignTableError);
    expect(() => parseTableRef(`${FAKE_PROJECT}.other_ds.t`)).toThrow(ForeignTableError);
    expect(() => parseTableRef('other_ds.t')).toThrow(ForeignTableError);
    expect(() => parseTableRef('justone')).toThrow(ForeignTableError);
    expect(() => parseTableRef('a.b.c.d')).toThrow(ForeignTableError);
  });
});

describe('createNewTable', () => {
  it('sets labels and an expiration about 7 days ahead', async () => {
    const before = Date.now();
    const { tableRef } = await createNewTable('t1', schema, { tool_name: 'x' });
    expect(tableRef).toBe(sessionTableRef('t1'));
    const options = bq.tables.get('t1')!.options as { expirationTime: string; labels: unknown };
    const ttl = Number(options.expirationTime) - before;
    expect(typeof options.expirationTime).toBe('string');
    expect(ttl).toBeGreaterThan(7 * 24 * 3600_000 - 5_000);
    expect(ttl).toBeLessThan(7 * 24 * 3600_000 + 5_000);
    expect(options.labels).toEqual({ tool_name: 'x' });
  });

  it('a 404 dataset triggers one createDataset and a retry; parallel offloads create once', async () => {
    bq.datasetExists = false;
    await Promise.all([createNewTable('a', schema, {}), createNewTable('b', schema, {})]);
    expect(bq.createDatasetCalls).toHaveLength(1);
    expect(bq.createDatasetCalls[0].id).toBe(FAKE_DATASET);
    expect(bq.createDatasetCalls[0].options).toEqual({ location: 'us-central1' });
    expect([...bq.tables.keys()].sort()).toEqual(['a', 'b']);
  });

  it('403 on dataset creation fails closed with the actionable message', async () => {
    bq.datasetExists = false;
    bq.createDatasetError = googleError(403, 'Access Denied: Project fake-project-123');
    const logs = captureLogs();
    const error = await createNewTable('a', schema, {}).catch((e: unknown) => e);
    logs.stop();
    expect(error).toBeInstanceOf(DatasetUnavailableError);
    const message = (error as Error).message;
    expect(message).toContain('roles/bigquery.dataEditor');
    expect(message).toContain('bq --location=us-central1 mk -d fake-project-123:aiassistant');
    // Memoised: a second offload does not call createDataset again.
    await createNewTable('b', schema, {}).catch(() => undefined);
    expect(bq.createDatasetCalls).toHaveLength(1);
    expect(logs.lines.filter((l) => l.includes('cannot create it')).length).toBe(1);
  });

  it('409 already exists is success', async () => {
    bq.createDatasetError = googleError(409, 'Already Exists');
    await expect(ensureDataset()).resolves.toBeUndefined();
  });

  it('other table-creation errors pass through', async () => {
    bq.dataset = () => {
      throw googleError(500, 'boom');
    };
    await expect(createNewTable('a', schema, {})).rejects.toThrow('boom');
  });
});

describe('insertRows', () => {
  it('sends chunks of at most 500 rows', async () => {
    await createNewTable('t1', schema, {});
    await insertRows(sessionTableRef('t1'), Array.from({ length: 1200 }, (_, i) => ({ id: String(i) })));
    expect(bq.insertCalls).toEqual([500, 500, 200]);
  });

  it('switches to load jobs once on the free-tier error and stays there', async () => {
    await createNewTable('t1', schema, {});
    bq.insertErrors = [new Error('Streaming insert is not allowed in the free tier')];
    await insertRows(sessionTableRef('t1'), [{ id: '1' }, { id: '2' }]);
    await insertRows(sessionTableRef('t1'), [{ id: '3' }]);
    expect(bq.loadJobs).toHaveLength(2);
    expect(bq.insertCalls).toEqual([]);
    expect(bq.tables.get('t1')!.rows).toHaveLength(3);
  });

  it('other insert errors are not swallowed', async () => {
    await createNewTable('t1', schema, {});
    bq.insertErrors = [new Error('quota')];
    await expect(insertRows(sessionTableRef('t1'), [{ id: '1' }])).rejects.toThrow('quota');
  });

  it('refuses a foreign table', async () => {
    await expect(insertRows('other.aiassistant.t', [{ id: '1' }])).rejects.toThrow(ForeignTableError);
  });
});

describe('exists and delete', () => {
  it('deleteTable is idempotent', async () => {
    await createNewTable('t1', schema, {});
    expect(await tableExists(sessionTableRef('t1'))).toBe(true);
    expect(await deleteTable(sessionTableRef('t1'))).toBe(true);
    expect(await deleteTable(sessionTableRef('t1'))).toBe(false);
    expect(await deleteTable(sessionTableRef('never'))).toBe(false);
  });
});
