/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Live BigQuery test of the per-session table helpers. Runs only through
 * `npm run test:integration` and only when GCP_SA_KEY_BASE64 is set (service/.env.local or the
 * environment); otherwise the suite is skipped. It creates one probe table in the configured
 * dataset (expires on its own after 7 days), appends rows, reads the metadata and drops it.
 * It never prints rows or credentials.
 */
import { randomUUID } from 'node:crypto';
import { resetEnsureDatasetForTests } from '../../src/analytics/bigquery/ensure-dataset';
import {
  createNewTable,
  deleteTable,
  getTableMetadata,
  insertRows,
  resetTablesForTests,
  tableExists,
} from '../../src/analytics/bigquery/tables';
import { resetConfigurationForTests } from '../../src/config';
import { useEnv } from '../helpers/use-env';

const live = Boolean(process.env.GCP_SA_KEY_BASE64);
const suite = live ? describe : describe.skip;
const kept = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => /^(GCP_|IMAGE_URL_MODE)/.test(k))
);

suite('BigQuery tables (live)', () => {
  const tableId = `it_probe_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  let tableRef: string | undefined;

  beforeAll(() => {
    useEnv(kept);
    resetEnsureDatasetForTests();
    resetTablesForTests();
  });
  afterAll(async () => {
    if (tableRef) await deleteTable(tableRef).catch(() => false);
    resetConfigurationForTests();
  });

  it('creates a table, appends rows, reads the metadata and drops it', async () => {
    ({ tableRef } = await createNewTable(
      tableId,
      [
        { name: 'id', type: 'STRING', mode: 'NULLABLE' },
        { name: 'amount', type: 'INTEGER', mode: 'NULLABLE' },
      ],
      { purpose: 'integration_test' }
    ));
    expect(await tableExists(tableRef)).toBe(true);

    await insertRows(tableRef, [
      { id: 'a', amount: 1 },
      { id: 'b', amount: 2 },
    ]);

    const metadata = await getTableMetadata(tableRef);
    expect((metadata.schema?.fields ?? []).map((f) => f.name)).toEqual(['id', 'amount']);

    expect(await deleteTable(tableRef)).toBe(true);
    expect(await tableExists(tableRef)).toBe(false);
    // Idempotent.
    expect(await deleteTable(tableRef)).toBe(false);
    tableRef = undefined;
  }, 120_000);
});
