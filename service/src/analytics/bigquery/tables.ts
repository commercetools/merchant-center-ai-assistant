/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import { INSERT_CHUNK_ROWS, TABLE_TTL_MS } from '../constants';
import { ensureDataset } from './ensure-dataset';
import {
  bigQueryTarget,
  bq,
  errorCode,
  errorText,
  type TablePort,
} from './ports';
import type { BigQuerySchemaField, Row, TableMetadataResult } from './types';

/** A table reference outside the configured project and dataset. */
export class ForeignTableError extends Error {
  constructor(message = 'Table reference is outside this deployment dataset') {
    super(message);
    this.name = 'ForeignTableError';
  }
}

export interface ParsedTableRef {
  projectId: string;
  datasetId: string;
  tableId: string;
}

/**
 * `dataset.table` or `project.dataset.table`. The project and dataset must equal the
 * configured ones: this service never touches anything else.
 */
export function parseTableRef(tableRef: string): ParsedTableRef {
  const t = bigQueryTarget();
  const parts = tableRef.replace(/`/g, '').trim().split('.');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new ForeignTableError(
      `Invalid table reference format. Expected 'datasetId.tableId'`
    );
  }
  const [projectId, datasetId, tableId] =
    parts.length === 3 ? parts : [t.projectId, parts[0], parts[1]];
  if (projectId !== t.projectId || datasetId !== t.datasetId || !tableId) {
    throw new ForeignTableError();
  }
  return { projectId, datasetId, tableId };
}

/** `project.dataset.table` for a table id of this deployment. */
export const fullTableRef = (tableId: string): string => {
  const t = bigQueryTarget();
  return `${t.projectId}.${t.datasetId}.${tableId}`;
};

const tablePort = (ref: string): TablePort => {
  const { datasetId, tableId } = parseTableRef(ref);
  return bq().dataset(datasetId).table(tableId);
};

const FREE_TIER_ERROR = 'Streaming insert is not allowed in the free tier';
/** Once the free-tier error was seen, the rest of the process uses load jobs. */
let useLoadJobs = false;

export const resetTablesForTests = (): void => {
  useLoadJobs = false;
};

const mentionsFreeTier = (error: unknown): boolean => {
  if (errorText(error).includes(FREE_TIER_ERROR)) return true;
  const nested = (error as { errors?: unknown } | null)?.errors;
  return Array.isArray(nested) && nested.some((e) => JSON.stringify(e).includes(FREE_TIER_ERROR));
};

/** Load job through a write stream (NDJSON). Slower than streaming but works without billing. */
async function loadRows(table: TablePort, rows: Row[]): Promise<void> {
  const stream = table.createWriteStream({ sourceFormat: 'NEWLINE_DELIMITED_JSON' });
  await new Promise<void>((resolve, reject) => {
    stream.on('complete', () => resolve());
    stream.on('error', (error) => reject(error));
    stream.end(rows.map((row) => JSON.stringify(row)).join('\n'));
  });
}

async function writeChunk(table: TablePort, chunk: Row[]): Promise<void> {
  if (!useLoadJobs) {
    try {
      await table.insert(chunk, { ignoreUnknownValues: true, skipInvalidRows: false });
      return;
    } catch (error) {
      if (!mentionsFreeTier(error)) throw error;
      useLoadJobs = true;
      logger.warn(
        'BigQuery streaming inserts are not available (billing is not enabled): switching to load jobs for this process'
      );
    }
  }
  await loadRows(table, chunk);
}

/** Inserts `rows` in chunks of `INSERT_CHUNK_ROWS` (streaming; load-job fallback). */
export async function insertRows(tableRef: string, rows: Row[]): Promise<void> {
  const table = tablePort(tableRef);
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_ROWS) {
    await writeChunk(table, rows.slice(i, i + INSERT_CHUNK_ROWS));
  }
  logger.info(`Inserted ${rows.length} rows into ${tableRef}`);
}

const isMissingDataset = (error: unknown): boolean =>
  errorCode(error) === 404 && /Not found: Dataset/i.test(errorText(error));

/**
 * Creates a table that expires after `TABLE_TTL_MS`. A missing dataset is created once
 * (when the service account may) and the creation retried.
 */
export async function createNewTable(
  tableId: string,
  schema: BigQuerySchemaField[],
  labels: Record<string, string>
): Promise<{ tableRef: string }> {
  const { datasetId } = bigQueryTarget();
  const options = (): Record<string, unknown> => ({
    schema: { fields: schema },
    labels,
    expirationTime: String(Date.now() + TABLE_TTL_MS),
  });
  try {
    await bq().dataset(datasetId).createTable(tableId, options());
  } catch (error) {
    if (!isMissingDataset(error)) throw error;
    await ensureDataset();
    await bq().dataset(datasetId).createTable(tableId, options());
  }
  const tableRef = fullTableRef(tableId);
  logger.info(`Created BigQuery table: ${tableRef}`);
  return { tableRef };
}

export async function tableExists(tableRef: string): Promise<boolean> {
  try {
    const [exists] = await tablePort(tableRef).exists();
    return exists;
  } catch (error) {
    // A dataset that does not exist yet means the table does not either.
    if (isMissingDataset(error)) return false;
    throw error;
  }
}

/** Idempotent: a missing table is `false`, not an error. */
export async function deleteTable(tableRef: string): Promise<boolean> {
  const table = tablePort(tableRef);
  const [exists] = await table.exists();
  if (!exists) return false;
  try {
    await table.delete();
  } catch (error) {
    if (errorCode(error) === 404) return false;
    throw error;
  }
  logger.info(`Deleted BigQuery table: ${tableRef}`);
  return true;
}

export async function getTableMetadata(tableRef: string): Promise<TableMetadataResult> {
  const [metadata] = await tablePort(tableRef).getMetadata();
  return {
    schema: metadata.schema,
    numRows: metadata.numRows,
    numBytes: metadata.numBytes,
    creationTime: metadata.creationTime,
    lastModifiedTime: metadata.lastModifiedTime,
  };
}
