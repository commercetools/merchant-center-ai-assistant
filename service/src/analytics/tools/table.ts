/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getTableMetadata } from '../bigquery/tables';
import type { TableMetadataResult } from '../bigquery/types';
import { findSessionTable, type SessionTablesAccessor } from './session-tables';

export const GET_TABLE_INFO_TOOL = 'get_table_info';

const getTableInfoSchema = z.object({
  tableRef: z
    .string()
    .describe('The reference of the table to get information about.'),
});

export interface TableToolDeps {
  tables: SessionTablesAccessor;
  getTableMetadata: (ref: string) => Promise<TableMetadataResult>;
}

type TableInfoResult =
  | ({ success: true } & TableMetadataResult)
  | {
      success: false;
      error: string;
      hint: string;
      availableTableRefs?: string[];
    };

const jsonSafe = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

/** Per-request factory. Only tables registered on the session are ever described. */
export function createTableInfoTool(deps: TableToolDeps) {
  return tool({
    description:
      'Get information about a BigQuery table of this conversation including schema, number of rows, number of bytes, creation time, and last modified time. Does not contain any data.',
    inputSchema: getTableInfoSchema,
    execute: async ({ tableRef }: z.infer<typeof getTableInfoSchema>): Promise<TableInfoResult> => {
      if (!tableRef) {
        return {
          success: false,
          error: 'No table reference provided',
          hint: 'Ensure the table reference is provided.',
        };
      }

      let registered;
      try {
        registered = await deps.tables();
      } catch {
        return {
          success: false,
          error: 'The tables of this conversation could not be read',
          hint: 'Try again; if it persists, fetch the data again.',
          availableTableRefs: [],
        };
      }
      // Never reveals tables of other sessions: only this session's refs are listed.
      const available = registered.map((t) => t.tableRef);
      const match = findSessionTable(registered, tableRef);
      if (!match) {
        return {
          success: false,
          error: `Table ${tableRef} is not a table of this conversation`,
          hint: 'Use one of the table references in availableTableRefs.',
          availableTableRefs: available,
        };
      }

      try {
        const result = await deps.getTableMetadata(match.tableRef);
        return jsonSafe({ success: true as const, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `BigQuery execution failed: ${message}`,
          hint: 'The table may have expired (tables are kept for 7 days); fetch the data again.',
          availableTableRefs: available,
        };
      }
    },
  });
}

export const createTableInfoToolFor = (tables: SessionTablesAccessor) =>
  createTableInfoTool({ tables, getTableMetadata });
