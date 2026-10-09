/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Ported unchanged in behaviour from the legacy `utils/bigquery.utils.ts`. The table-name
// derivation (`toTableName`) strips READ/GET/... prefixes and RESULT/DATA/... suffixes on
// purpose: tests pin it. Do not "improve" it.

export type TableData = Record<string, unknown>[];
export type TablesInput = Record<string, TableData>;

/** Convert a key like "READ ORDER RESULT" to a valid SQL table name like "order". */
function toTableName(key: string): string {
  const cleaned = key
    .replace(/\s*(RESULT|DATA|RESPONSE|LIST|ITEMS)$/i, '')
    .replace(/^(READ|GET|FETCH|QUERY|SEARCH)\s*/i, '')
    .trim();

  return (
    cleaned
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'data'
  );
}

/** Escapes literal control characters, which are invalid inside JSON strings. */
export function sanitizeJsonString(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1F\x7F]/g, (char) => {
    switch (char) {
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return '';
    }
  });
}

export interface ParsedTables {
  tables: TablesInput;
  parseErrors: string[];
  total?: number;
  count?: number;
}

/**
 * Parses the raw tool result string into tables. Handles
 * `{"READ ORDER RESULT": {"results": [...], "total": 100, "count": 20}}`.
 */
export function parseRawDataToTables(rawData: string): ParsedTables {
  const tables: TablesInput = {};
  const parseErrors: string[] = [];
  let total: number | undefined;
  let count: number | undefined;

  try {
    const parsed: unknown = JSON.parse(sanitizeJsonString(rawData));

    if (typeof parsed !== 'object' || parsed === null) {
      parseErrors.push('Parsed data is not an object');
      return { tables, parseErrors };
    }

    for (const [key, value] of Object.entries(parsed)) {
      const tableName = toTableName(key);

      if (Array.isArray(value)) {
        if (value.length > 0) tables[tableName] = value as TableData;
      } else if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;

        if (typeof obj.total === 'number') total = obj.total;
        if (typeof obj.count === 'number') count = obj.count;

        if (Array.isArray(obj.results) && obj.results.length > 0) {
          tables[tableName] = obj.results as TableData;
        } else if (Array.isArray(obj.data) && obj.data.length > 0) {
          tables[tableName] = obj.data as TableData;
        } else if (Array.isArray(obj.items) && obj.items.length > 0) {
          tables[tableName] = obj.items as TableData;
        } else if (Object.keys(obj).length > 0) {
          // A nested array of objects is the table; otherwise the object is a one-row table.
          let foundArray = false;
          for (const [nestedKey, nestedValue] of Object.entries(obj)) {
            if (
              Array.isArray(nestedValue) &&
              nestedValue.length > 0 &&
              typeof nestedValue[0] === 'object'
            ) {
              tables[toTableName(nestedKey)] = nestedValue as TableData;
              foundArray = true;
            }
          }
          if (!foundArray) tables[tableName] = [obj];
        }
      }
    }
  } catch (e) {
    // The string may have text around the JSON.
    const jsonMatch = rawData.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extracted: unknown = JSON.parse(jsonMatch[0]);
        return parseRawDataToTables(JSON.stringify(extracted));
      } catch {
        parseErrors.push(
          `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    } else {
      parseErrors.push(
        `Failed to parse raw data: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return { tables, parseErrors, total, count };
}
