/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { parseRawDataToTables } from '../../src/analytics/pipeline/parse';
import {
  inferBigQuerySchema,
  prepareDataForBigQuery,
  renderColumns,
} from '../../src/analytics/pipeline/schema';

/*
 * Ported from the legacy `table-schema-inline.spec.ts`: the offloaded table's columns must
 * reach the model without a second round trip (`Unrecognized name: orderNumber` was seen in
 * three production turns).
 */
const ORDER_ROWS = [
  { id: 'ord-1', orderNumber: '20d04fd3', totalPrice: 4999, createdAt: '2026-09-28T10:00:00Z', complete: true },
  { id: 'ord-2', orderNumber: '31e15ge4', totalPrice: 15000, createdAt: '2026-09-29T10:00:00Z', complete: false },
];

const render = (rows: Record<string, unknown>[]): string => renderColumns(inferBigQuerySchema(rows));

describe('the inferred schema is what the model gets told', () => {
  it('names every column with its type', () => {
    const columns = render(ORDER_ROWS);
    for (const name of Object.keys(ORDER_ROWS[0])) expect(columns).toContain(name);
    expect(columns).toMatch(/orderNumber STRING/);
    expect(columns).toMatch(/totalPrice (INTEGER|FLOAT|NUMERIC)/);
    expect(columns).toMatch(/createdAt TIMESTAMP/);
    expect(columns).toMatch(/complete BOOLEAN/);
  });

  it('no columns to report is not an error', () => {
    expect(render([])).toBe('');
  });

  it('infers DATE, JSON, FLOAT and takes the first non-null value', () => {
    const schema = inferBigQuerySchema([
      { d: '2026-01-02', j: null, f: null },
      { d: '2026-01-03', j: { a: 1 }, f: 1.5 },
    ]);
    const types = Object.fromEntries(schema.map((f) => [f.name, f.type]));
    expect(types).toEqual({ d: 'DATE', j: 'JSON', f: 'FLOAT' });
    expect(schema.every((f) => f.mode === 'NULLABLE')).toBe(true);
  });
});

describe('prepareDataForBigQuery', () => {
  it('stores objects and arrays as JSON strings, leaves scalars and null', () => {
    const [row] = prepareDataForBigQuery([{ a: { x: 1 }, b: [1, 2], c: 'z', d: null, e: 3 }]);
    expect(row).toEqual({ a: '{"x":1}', b: '[1,2]', c: 'z', d: null, e: 3 });
  });
});

describe('parseRawDataToTables', () => {
  it('names the table from the envelope key and keeps pagination', () => {
    const raw = JSON.stringify({ 'READ ORDER RESULT': { results: [{ id: 1 }], total: 9, count: 1 } });
    const { tables, total, count } = parseRawDataToTables(raw);
    expect(Object.keys(tables)).toEqual(['order']);
    expect([total, count]).toEqual([9, 1]);
  });

  it('finds data/items arrays, nested arrays and single objects', () => {
    expect(Object.keys(parseRawDataToTables('{"X DATA":{"data":[{"a":1}]}}').tables)).toEqual(['x']);
    expect(Object.keys(parseRawDataToTables('{"X":{"items":[{"a":1}]}}').tables)).toEqual(['x']);
    expect(Object.keys(parseRawDataToTables('{"X":{"rows":[{"a":1}]}}').tables)).toEqual(['rows']);
    expect(parseRawDataToTables('{"X":{"a":1}}').tables.x).toEqual([{ a: 1 }]);
  });

  it('extracts JSON surrounded by text and survives control characters', () => {
    expect(parseRawDataToTables('prefix {"X":{"results":[{"a":1}]}} suffix').tables.x).toEqual([{ a: 1 }]);
    expect(parseRawDataToTables('{"X":{"results":[{"a":"l1\nl2"}]}}').tables.x).toEqual([{ a: 'l1\nl2' }]);
  });

  it('reports a parse error for non-JSON', () => {
    expect(parseRawDataToTables('nope').parseErrors).toHaveLength(1);
  });
});
