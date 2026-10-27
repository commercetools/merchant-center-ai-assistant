/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getServices } from '../../services/registry';
import type { TemporaryTable } from '../../types/chat.types';
import { logger } from '../../utils/logger.utils';
import {
  createNewTable,
  fullTableRef,
  insertRows,
  tableExists,
} from '../bigquery/tables';
import type { BigQuerySchemaField, Row } from '../bigquery/types';
import { OFFLOAD_MAX_BYTES, OFFLOAD_MAX_ROWS } from '../constants';
import { parseRawDataToTables } from './parse';
import {
  inferBigQuerySchema,
  prepareDataForBigQuery,
  renderColumns,
} from './schema';

export interface StoreInput {
  result: unknown;
  toolName: string;
  toolArgs: string;
  sessionId: string;
  userId: string;
}

export interface StoreResult {
  tableRef: string;
  isNewTable: boolean;
  total?: number;
  count?: number;
  /** `name TYPE, ...`, put in front of the model so it does not guess column names. */
  columns?: string;
  /** Rows beyond the per-offload caps that were not stored. */
  droppedRows: number;
}

export interface StoreDeps {
  tableExists(ref: string): Promise<boolean>;
  createTable(
    tableId: string,
    schema: BigQuerySchemaField[],
    labels: Record<string, string>
  ): Promise<{ tableRef: string }>;
  insertRows(ref: string, rows: Row[]): Promise<void>;
  addTemporaryTable(
    sessionId: string,
    userId: string,
    table: TemporaryTable
  ): Promise<unknown>;
}

export const defaultStoreDeps: StoreDeps = {
  tableExists,
  createTable: createNewTable,
  insertRows,
  // Ownership is checked by `SessionService` (`userId`); only the id takes part.
  addTemporaryTable: (sessionId, userId, table) =>
    getServices().sessions.addTemporaryTable(
      sessionId,
      { userId, projectKey: '', isAdmin: false },
      table
    ),
};

const sanitise = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, '_');

/** The table id of a session and tool: `{sessionId}_{toolName}`, `[A-Za-z0-9_]` only. */
export const tableIdFor = (sessionId: string, toolName: string): string =>
  `${sanitise(sessionId)}_${sanitise(toolName)}`;

/** Keeps rows while both caps hold; reports how many were dropped. */
export function capRows(rows: Row[]): { kept: Row[]; dropped: number } {
  const kept: Row[] = [];
  let bytes = 0;
  for (const row of rows) {
    if (kept.length >= OFFLOAD_MAX_ROWS) break;
    bytes += JSON.stringify(row).length;
    if (bytes > OFFLOAD_MAX_BYTES) break;
    kept.push(row);
  }
  return { kept, dropped: rows.length - kept.length };
}

/**
 * Writes the tool result into the session's BigQuery table (append when it exists) and
 * registers a NEW table on the session exactly once. Returns `undefined` when there is
 * nothing tabular to store. Only the first parsed table of a multi-table result is stored.
 */
export async function storeToolResultInBigQuery(
  input: StoreInput,
  deps: StoreDeps = defaultStoreDeps
): Promise<StoreResult | undefined> {
  const { tables, parseErrors, total, count } = parseRawDataToTables(
    input.result as string
  );

  if (parseErrors.length > 0 && Object.keys(tables).length === 0) {
    logger.warn('Could not parse tool result for BigQuery storage', {
      errors: parseErrors,
    });
    return undefined;
  }

  const tableNames = Object.keys(tables);
  if (tableNames.length === 0) {
    logger.debug('No tabular data found in tool result, skipping BigQuery storage');
    return undefined;
  }

  const all = tables[tableNames[0]];
  if (all.length === 0) return undefined;

  const { kept, dropped } = capRows(all);
  const schema = inferBigQuerySchema(kept);
  if (schema.length === 0) return undefined;

  const columnNames = schema.map((field) => field.name).join(',');
  const columns = renderColumns(schema);
  const prepared = prepareDataForBigQuery(kept);

  const tableId = tableIdFor(input.sessionId, input.toolName);
  const tableRef = fullTableRef(tableId);

  if (await deps.tableExists(tableRef)) {
    await deps.insertRows(tableRef, prepared);
    return { tableRef, isNewTable: false, total, count, columns, droppedRows: dropped };
  }

  await deps.createTable(tableId, schema, {
    tool_name: sanitise(input.toolName).toLowerCase().substring(0, 63),
    session_id: sanitise(input.sessionId).toLowerCase().substring(0, 63),
  });
  await deps.insertRows(tableRef, prepared);

  await deps.addTemporaryTable(input.sessionId, input.userId, {
    tableRef,
    toolName: input.toolName,
    args: input.toolArgs,
    columnNames,
  });

  return { tableRef, isNewTable: true, total, count, columns, droppedRows: dropped };
}
