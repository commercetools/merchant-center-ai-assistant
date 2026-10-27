/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { BigQuerySchemaField } from '../bigquery/types';
import type { TableData } from './parse';

function inferBigQueryType(value: unknown): BigQuerySchemaField['type'] {
  if (value === null || value === undefined) return 'STRING';
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'INTEGER' : 'FLOAT';
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'TIMESTAMP';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'DATE';
    return 'STRING';
  }
  if (Array.isArray(value) || typeof value === 'object') return 'JSON';
  return 'STRING';
}

/** Objects and arrays are stored as JSON strings (the column type is JSON). */
export function prepareDataForBigQuery(
  data: TableData
): Record<string, unknown>[] {
  return data.map((row) => {
    const processed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      processed[key] =
        value !== null && value !== undefined && typeof value === 'object'
          ? JSON.stringify(value)
          : value;
    }
    return processed;
  });
}

/** Schema from the first 10 rows (first non-null value per column decides the type). */
export function inferBigQuerySchema(data: TableData): BigQuerySchemaField[] {
  if (data.length === 0) return [];

  const allColumns = new Set<string>();
  const sampleSize = Math.min(data.length, 10);
  for (let i = 0; i < sampleSize; i++) {
    Object.keys(data[i]).forEach((key) => allColumns.add(key));
  }

  const schema: BigQuerySchemaField[] = [];
  for (const column of allColumns) {
    let inferred: BigQuerySchemaField['type'] = 'STRING';
    for (let i = 0; i < sampleSize; i++) {
      const value = data[i][column];
      if (value !== null && value !== undefined) {
        inferred = inferBigQueryType(value);
        break;
      }
    }
    schema.push({ name: column, type: inferred, mode: 'NULLABLE' });
  }
  return schema;
}

/** `name TYPE, ...` as shown to the model. */
export const renderColumns = (schema: BigQuerySchemaField[]): string =>
  schema.map((field) => `${field.name} ${field.type}`).join(', ');
