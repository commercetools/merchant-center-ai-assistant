/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import {
  QUERY_JOB_TIMEOUT_MS,
  QUERY_MAX_BYTES_BILLED,
  QUERY_MAX_ROWS,
  QUERY_RESULT_MAX_BYTES,
} from '../constants';
import { assertSelectOverSessionTables, preFilter } from '../guard/sql-guard';
import { bigQueryTarget, bq } from './ports';

export interface GuardedQueryResult {
  rows: unknown[];
  /** Rows the query produced (may exceed `rows.length`). */
  totalRows: number;
  truncated: boolean;
}

/** BigQuery label values: lower-case letters, digits, `_` and `-`, at most 63 characters. */
const labelValue = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9_-]/g, '_').substring(0, 63);

/** JSON round trip: BigQuery returns wrapper types (`BigQueryDate`, numerics) that break the SDK. */
const jsonSafe = (rows: unknown[]): unknown[] =>
  JSON.parse(JSON.stringify(rows)) as unknown[];

/** Drops rows from the end until the serialized rows fit `QUERY_RESULT_MAX_BYTES`. */
export function fitToBytes(rows: unknown[]): { rows: unknown[]; trimmed: boolean } {
  let size = 2;
  const kept: unknown[] = [];
  for (const row of rows) {
    size += JSON.stringify(row).length + 1;
    if (size > QUERY_RESULT_MAX_BYTES) return { rows: kept, trimmed: true };
    kept.push(row);
  }
  return { rows: kept, trimmed: false };
}

/**
 * Runs model-authored SQL safely: (1) pre-filter, (2) a dry run with the same configuration
 * whose statistics must show a SELECT over this session's tables only, (3) the real job with
 * `maximumBytesBilled`, a job timeout and labels, (4) at most `QUERY_MAX_ROWS` rows and
 * `QUERY_RESULT_MAX_BYTES` bytes. Throws `GuardRejection` (safe to show the model) or the
 * BigQuery error (dry-run failures included).
 */
export async function runGuardedQuery(
  sql: string,
  sessionId: string,
  sessionTables: string[]
): Promise<GuardedQueryResult> {
  const query = preFilter(sql);
  const t = bigQueryTarget();
  const base = {
    query,
    location: t.location,
    defaultDataset: { projectId: t.projectId, datasetId: t.datasetId },
    maximumBytesBilled: QUERY_MAX_BYTES_BILLED,
    labels: { app: 'ai-assistant', session_id: labelValue(sessionId) },
  };

  const [dry] = await bq().createQueryJob({ ...base, dryRun: true });
  assertSelectOverSessionTables(
    query,
    dry.metadata?.statistics?.query,
    sessionTables,
    { projectId: t.projectId, datasetId: t.datasetId }
  );

  const [job] = await bq().createQueryJob({
    ...base,
    jobTimeoutMs: QUERY_JOB_TIMEOUT_MS,
  });
  logger.info(`BigQuery job ${job.id ?? ''} started`);

  const [rows, , response] = await job.getQueryResults({ maxResults: QUERY_MAX_ROWS });
  const total = Number(response?.totalRows ?? rows.length);
  const totalRows = Number.isFinite(total) ? total : rows.length;

  const capped = rows.slice(0, QUERY_MAX_ROWS);
  const { rows: fitted, trimmed } = fitToBytes(jsonSafe(capped));
  return {
    rows: fitted,
    totalRows,
    truncated: trimmed || totalRows > fitted.length,
  };
}
