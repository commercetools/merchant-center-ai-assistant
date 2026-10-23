/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { logger } from '../../utils/logger.utils';
import type { TemporaryTable } from '../../types/chat.types';
import { runGuardedQuery, type GuardedQueryResult } from '../bigquery/queries';
import { getTableMetadata } from '../bigquery/tables';
import type { TableMetadataResult } from '../bigquery/types';
import { GuardRejection } from '../guard/sql-guard';
import { renderFieldColumns } from './columns';
import {
  findSessionTable,
  normaliseTableRef,
  type SessionTablesAccessor,
} from './session-tables';

export const QUERY_AGGREGATED_DATA_TOOL = 'query_aggregated_data';

const aggregateDataSchema = z.object({
  tableRefs: z
    .array(z.string())
    .describe(
      'Array of BigQuery table references (format: "datasetId.tableId") from previous tool results stored in this session. These are the tables you can query against.'
    ),
  query: z
    .string()
    .describe(
      'Standard SQL query to execute against the BigQuery tables. Use fully qualified table names in the format `project.dataset.table` or reference tables by their tableId (will be auto-expanded). Supports BigQuery SQL SELECT statements only: WHERE, GROUP BY, ORDER BY, LIMIT, JOIN, aggregations (COUNT, SUM, AVG, MIN, MAX), window functions, etc. try not to use Select * as it might fill up the context window.'
    ),
});

type AggregateInput = z.infer<typeof aggregateDataSchema>;

interface AggregateDataSuccess {
  success: true;
  rowCount: number;
  data: unknown[];
  tableRefs: string[];
  truncated?: true;
  totalRows?: number;
  hint?: string;
}

interface AggregateDataError {
  success: false;
  error: string;
  hint: string;
  query?: string;
  availableTableRefs?: string[];
  /** Actual columns of each session table, `tableRef` -> `name TYPE, ...`. */
  tableColumns?: Record<string, string>;
}

export type AggregateDataResult = AggregateDataSuccess | AggregateDataError;

export interface QueryToolDeps {
  sessionId: string;
  tables: SessionTablesAccessor;
  runGuardedQuery: (
    sql: string,
    sessionId: string,
    sessionTables: string[]
  ) => Promise<GuardedQueryResult>;
  getTableMetadata: (ref: string) => Promise<TableMetadataResult>;
}

const defaultDeps = (
  sessionId: string,
  tables: SessionTablesAccessor
): QueryToolDeps => ({
  sessionId,
  tables,
  runGuardedQuery,
  getTableMetadata,
});

/**
 * The real columns of every session table, for the error path only. A bare
 * `Unrecognized name: orderNumber` says which name was wrong, never which are right; seen in
 * three production turns. Best-effort: a failing lookup never replaces the real error.
 */
const describeTables = async (
  deps: QueryToolDeps,
  tableRefs: string[]
): Promise<Record<string, string> | undefined> => {
  const described = await Promise.all(
    tableRefs.map(async (tableRef) => {
      try {
        const { schema } = await deps.getTableMetadata(tableRef);
        const columns = renderFieldColumns(schema?.fields);
        return columns ? ([tableRef, columns] as const) : undefined;
      } catch {
        return undefined;
      }
    })
  );
  const entries = described.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== undefined
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** Session tables named by the model, else all of the session's tables. */
const tablesToDescribe = (
  registered: TemporaryTable[],
  requested: string[]
): string[] => {
  const named = requested
    .map((ref) => findSessionTable(registered, ref)?.tableRef)
    .filter((ref): ref is string => ref !== undefined);
  return named.length ? [...new Set(named)] : registered.map((t) => t.tableRef);
};

const description = `Run SQL queries against BigQuery tables created from previous tool results for aggregation, filtering, grouping, joining, and analysis.
- IMPORTANT: Use this tool after reading/fetching data from commercetools (when tables have been created in BigQuery).
- Only SELECT statements over the tables of this conversation are allowed; anything else is rejected.
- Table references are provided by the system after data is fetched (format: projectId.datasetId.tableId).
- If you don't know the table schema, use other tools to get the schema.
- Supports standard BigQuery SQL: SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, JOIN, UNION, COUNT, SUM, AVG, MIN, MAX, DISTINCT, HAVING, window functions.
- For JSON fields, use JSON_EXTRACT or or JSON_QUERY functions (e.g., JSON_QUERY(column, '$.field')).
- DO NOT try to fetch any localized fields like Name, Description, etc. that might result in SQL errors, create a simple query to fetch the IDs. Other tools can translate ID to Name, Description, etc.
- Returns query results as an array of rows (at most 500 rows; aggregate or add a LIMIT for more).`;

/** Per-request factory: the session is bound at creation, never process-wide. */
export function createQueryTool(deps: QueryToolDeps) {
  return tool({
    description,
    inputSchema: aggregateDataSchema,
    execute: async ({ tableRefs, query }: AggregateInput): Promise<AggregateDataResult> => {
      if (!tableRefs || tableRefs.length === 0) {
        return {
          success: false,
          error: 'No table references provided',
          hint: 'Ensure data has been fetched and stored in BigQuery tables before running aggregation queries. The tableRefs should be provided after tool results are stored.',
          availableTableRefs: [],
        };
      }

      let registered: TemporaryTable[];
      try {
        registered = await deps.tables();
      } catch (error) {
        logger.warn('query_aggregated_data: session tables unavailable', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
        return {
          success: false,
          error: 'The tables of this conversation could not be read',
          hint: 'Try again; if it persists, fetch the data again.',
          availableTableRefs: [],
        };
      }
      const availableTableRefs = registered.map((t) => t.tableRef);
      const sessionRefs = registered
        .map((t) => normaliseTableRef(t.tableRef))
        .filter((ref): ref is string => ref !== undefined);

      try {
        const result = await deps.runGuardedQuery(query, deps.sessionId, sessionRefs);
        return {
          success: true,
          rowCount: result.rows.length,
          data: result.rows,
          tableRefs,
          ...(result.truncated
            ? {
                truncated: true as const,
                totalRows: result.totalRows,
                hint: 'The result was truncated: aggregate (GROUP BY) or add a LIMIT to see fewer, more useful rows.',
              }
            : {}),
        };
      } catch (error) {
        if (error instanceof GuardRejection) {
          return {
            success: false,
            error: error.message,
            hint: error.hint ?? 'Use only SELECT over the listed tables.',
            query,
            availableTableRefs,
          };
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const tableColumns = await describeTables(
          deps,
          tablesToDescribe(registered, tableRefs)
        );
        return {
          success: false,
          error: `BigQuery execution failed: ${errorMessage}`,
          query,
          availableTableRefs,
          ...(tableColumns && { tableColumns }),
          hint: tableColumns
            ? 'tableColumns lists every column that exists, with its type. Rewrite the query using only those names - a column absent from the list does not exist in the table, however standard the field is for this entity. Optional fields are missing when no row had a value. For JSON columns use JSON_EXTRACT() or JSON_QUERY().'
            : 'Check that table names in the query match the provided tableRefs. Use standard BigQuery SQL syntax. For JSON fields, use JSON_EXTRACT() or JSON_QUERY().',
        };
      }
    },
  });
}

export const createQueryToolFor = (sessionId: string, tables: SessionTablesAccessor) =>
  createQueryTool(defaultDeps(sessionId, tables));
