/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { parseRawDataToTables } from '../../src/analytics/pipeline/parse';
import { toOffloadPayload, toResultShapeOf } from '../../src/analytics/pipeline/payload';

/*
 * WIRE CONTRACT between the tool sources and the parser: an MCP `CallToolResult` object used
 * to kill the offload with `rawData.match is not a function` (a 1.1 MB product page then
 * landed in the context window).
 */
const products = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, key: `sku-${i}` }));
const READ_PRODUCTS_BODY = { limit: 100, offset: 0, count: 100, total: 4187, results: products };

const mcpResult = (text: string, extra: Record<string, unknown> = {}) => ({
  content: [{ type: 'text', text }],
  isError: false,
  ...extra,
});

const offload = (result: unknown, toolName: string) =>
  parseRawDataToTables(toOffloadPayload(result, toolName) as string);

describe('MCP CallToolResult -> BigQuery offload', () => {
  it('does not throw on the object shape that used to kill the offload', () => {
    expect(() => offload(mcpResult(JSON.stringify(READ_PRODUCTS_BODY)), 'read_products')).not.toThrow();
  });

  it('keeps the rows, the table name and the pagination metadata', () => {
    const { tables, total, count, parseErrors } = offload(
      mcpResult(JSON.stringify(READ_PRODUCTS_BODY)),
      'read_products'
    );
    expect(parseErrors).toEqual([]);
    expect(Object.keys(tables)).toEqual(['products']);
    expect(tables.products).toHaveLength(100);
    expect(total).toBe(4187);
    expect(count).toBe(100);
  });

  it('wraps in the READ PRODUCTS RESULT envelope', () => {
    const payload = toOffloadPayload(mcpResult(JSON.stringify(READ_PRODUCTS_BODY)), 'read_products') as string;
    expect(Object.keys(JSON.parse(payload) as object)).toEqual(['READ PRODUCTS RESULT']);
  });

  it('prefers structuredContent when the server sets it', () => {
    const { tables, total } = offload(
      mcpResult('ignored', { structuredContent: READ_PRODUCTS_BODY }),
      'read_product_search'
    );
    expect(Object.keys(tables)).toEqual(['product_search']);
    expect(total).toBe(4187);
  });

  it('joins a result split across several text parts', () => {
    const text = JSON.stringify(READ_PRODUCTS_BODY);
    const split = { content: [{ type: 'text', text: text.slice(0, 50) }, { type: 'text', text: text.slice(50) }] };
    expect(offload(split, 'read_products').tables.products).toHaveLength(100);
  });

  it('degrades to a parse error, not a throw, when the text is not JSON', () => {
    const { tables, parseErrors } = offload(mcpResult('permission denied', { isError: true }), 'read_orders');
    expect(tables).toEqual({});
    expect(parseErrors).toHaveLength(1);
  });
});

describe('the in-process string path is untouched', () => {
  const legacy = JSON.stringify({ 'READ PRODUCT RESULT': { results: [{ id: 'p1' }], total: 1, count: 1 } });

  it('passes a string through unchanged', () => {
    expect(toOffloadPayload(legacy, 'search_products')).toBe(legacy);
  });

  it('still parses to the same table, total and count', () => {
    const { tables, total, count } = offload(legacy, 'search_products');
    expect(Object.keys(tables)).toEqual(['product']);
    expect([total, count]).toEqual([1, 1]);
  });
});

const MESSAGE = 'BigQuery table created: proj.ds.sess_read_products. Use this table reference.';
const mcpToModelOutputGuard = (output: unknown) =>
  !('content' in (output as object)) || !Array.isArray((output as { content: unknown }).content);

describe('the offload message goes back in the tool result shape', () => {
  const mcpOriginal = { content: [{ type: 'text', text: '{"results":[]}' }], isError: false };

  it('an MCP result gets a CallToolResult back, not a bare string', () => {
    const returned = toResultShapeOf(MESSAGE, mcpOriginal) as { content: unknown[]; isError: boolean };
    expect(returned.content).toEqual([{ type: 'text', text: MESSAGE }]);
    expect(returned.isError).toBe(false);
  });

  it("mcpToModelOutput's `'content' in result` does not throw on it, and a bare string would", () => {
    expect(mcpToModelOutputGuard(toResultShapeOf(MESSAGE, mcpOriginal))).toBe(false);
    expect(() => mcpToModelOutputGuard(MESSAGE)).toThrow(TypeError);
  });

  it('a non-MCP result gets the plain string', () => {
    expect(toResultShapeOf(MESSAGE, '{"READ PRODUCT RESULT":{}}')).toBe(MESSAGE);
  });
});
