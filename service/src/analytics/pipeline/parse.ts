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

const ROW_KEYS = ['results', 'data', 'items'] as const;

/** The first of `results`/`data`/`items` that is a non-empty array. */
function findRows(obj: Record<string, unknown>): TableData | undefined {
  for (const key of ROW_KEYS) {
    const value = obj[key];
    if (Array.isArray(value) && value.length > 0) return value as TableData;
  }
  return undefined;
}

/** A nested array of objects is the table; otherwise the object is a one-row table. */
function addNestedTables(tables: TablesInput, tableName: string, obj: Record<string, unknown>): void {
  let foundArray = false;
  for (const [nestedKey, nestedValue] of Object.entries(obj)) {
    if (Array.isArray(nestedValue) && nestedValue.length > 0 && typeof nestedValue[0] === 'object') {
      tables[toTableName(nestedKey)] = nestedValue as TableData;
      foundArray = true;
    }
  }
  if (!foundArray) tables[tableName] = [obj];
}

function addEntry(parsed: ParsedTables, key: string, value: unknown): void {
  const { tables } = parsed;
  const tableName = toTableName(key);

  if (Array.isArray(value)) {
    if (value.length > 0) tables[tableName] = value as TableData;
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  const obj = value as Record<string, unknown>;
  if (typeof obj.total === 'number') parsed.total = obj.total;
  if (typeof obj.count === 'number') parsed.count = obj.count;

  const rows = findRows(obj);
  if (rows) tables[tableName] = rows;
  else if (Object.keys(obj).length > 0) addNestedTables(tables, tableName, obj);
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The string may have text around the JSON: retry on the outermost braces. */
function recoverFromParseError(rawData: string, e: unknown, parseErrors: string[]): ParsedTables | undefined {
  const jsonMatch = rawData.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    parseErrors.push(`Failed to parse raw data: ${errorMessage(e)}`);
    return undefined;
  }
  try {
    const extracted: unknown = JSON.parse(jsonMatch[0]);
    return parseRawDataToTables(JSON.stringify(extracted));
  } catch {
    parseErrors.push(`Failed to parse JSON: ${errorMessage(e)}`);
    return undefined;
  }
}

/**
 * Parses the raw tool result string into tables. Handles
 * `{"READ ORDER RESULT": {"results": [...], "total": 100, "count": 20}}`.
 */
export function parseRawDataToTables(rawData: string): ParsedTables {
  const result: ParsedTables = { tables: {}, parseErrors: [], total: undefined, count: undefined };

  try {
    const parsed: unknown = JSON.parse(sanitizeJsonString(rawData));

    if (typeof parsed !== 'object' || parsed === null) {
      result.parseErrors.push('Parsed data is not an object');
      return { tables: result.tables, parseErrors: result.parseErrors };
    }

    for (const [key, value] of Object.entries(parsed)) addEntry(result, key, value);
  } catch (e) {
    const recovered = recoverFromParseError(rawData, e, result.parseErrors);
    if (recovered) return recovered;
  }

  return result;
}
