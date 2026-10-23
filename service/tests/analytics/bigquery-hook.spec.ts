/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { bigqueryCleanupHook, forEachLimited } from '../../src/analytics/cleanup/bigquery-hook';
import { resetConfigurationForTests } from '../../src/config';
import type { ChatSession } from '../../src/types/chat.types';
import { FakeBigQuery, googleError } from '../helpers/bigquery-fake';
import { sessionTableRef, useGcpEnv } from '../helpers/gcp-env';

const SESSION_ID = '3f2b8c1e-aaaa-bbbb-cccc-1234567890ab';
const PREFIX = '3f2b8c1e_aaaa_bbbb_cccc_1234567890ab';
let bq: FakeBigQuery;

const session = (refs: string[]): ChatSession => ({
  id: SESSION_ID,
  userId: 'u1',
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 1,
  temporaryTables: refs.map((tableRef) => ({ tableRef, toolName: 't', args: '{}' })),
});

const seed = (...ids: string[]) =>
  ids.forEach((id) =>
    bq.tables.set(id, { id, rows: [], options: {}, deleted: false, metadata: {} })
  );

beforeEach(() => {
  useGcpEnv();
  bq = new FakeBigQuery();
  setBigQueryForTests(bq);
});
afterEach(() => {
  setBigQueryForTests(undefined);
  resetConfigurationForTests();
});

describe('BigQuery cleanup hook', () => {
  it('drops the three tables of the session', async () => {
    const ids = [`${PREFIX}_a`, `${PREFIX}_b`, `${PREFIX}_c`];
    seed(...ids);
    await bigqueryCleanupHook(session(ids.map(sessionTableRef)));
    expect(ids.every((id) => bq.tables.get(id)!.deleted)).toBe(true);
  });

  it('skips a table in another dataset or project and a table of another session', async () => {
    seed(`${PREFIX}_a`, 'foreign_session_a');
    await bigqueryCleanupHook(
      session([
        'fake-project-123.other_dataset.x',
        'other-project.aiassistant.y',
        sessionTableRef('foreign_session_a'),
        sessionTableRef(`${PREFIX}_a`),
      ])
    );
    expect(bq.tables.get('foreign_session_a')!.deleted).toBe(false);
    expect(bq.tables.get(`${PREFIX}_a`)!.deleted).toBe(true);
  });

  it('a missing table is not an error', async () => {
    await expect(bigqueryCleanupHook(session([sessionTableRef(`${PREFIX}_gone`)]))).resolves.toBeUndefined();
  });

  it('a failing delete does not throw and the others are still dropped', async () => {
    seed(`${PREFIX}_a`, `${PREFIX}_b`);
    const original = bq.dataset.bind(bq);
    bq.dataset = () => {
      const ds = original();
      return {
        ...ds,
        table: (id: string) => {
          const t = ds.table(id);
          return id.endsWith('_a')
            ? { ...t, delete: async () => Promise.reject(googleError(500, 'boom')) }
            : t;
        },
      };
    };
    await expect(
      bigqueryCleanupHook(session([`${PREFIX}_a`, `${PREFIX}_b`].map(sessionTableRef)))
    ).resolves.toBeUndefined();
    expect(bq.tables.get(`${PREFIX}_b`)!.deleted).toBe(true);
  });

  it('does nothing without a service-account key or without tables', async () => {
    resetConfigurationForTests();
    useGcpEnv({ GCP_SA_KEY_BASE64: '' });
    await expect(bigqueryCleanupHook(session([sessionTableRef(`${PREFIX}_a`)]))).resolves.toBeUndefined();
    await expect(bigqueryCleanupHook(session([]))).resolves.toBeUndefined();
  });
});

describe('forEachLimited', () => {
  it('runs at most the given number in parallel', async () => {
    let active = 0;
    let max = 0;
    await forEachLimited([1, 2, 3, 4, 5, 6, 7, 8], 4, async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(max).toBe(4);
  });
});
