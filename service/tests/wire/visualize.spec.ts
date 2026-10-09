/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { visualizeDataTool } from '../../src/tools/visualize.tool';

type Input = Parameters<typeof visualizeDataTool.execute>[0];

const TABLE = {
  cols: [
    { label: 'Week', type: 'string' },
    { label: 'Orders', type: 'number' },
  ],
  rows: [
    { c: [{ v: 'Week 1' }, { v: 150 }] },
    { c: [{ v: 'Week 2' }, { v: 170 }] },
  ],
};

describe('visualize_data', () => {
  it('returns the chart specification for a two-column table', async () => {
    const result = await visualizeDataTool.execute({
      chartType: 'ColumnChart',
      data: TABLE,
      options: { title: 'Orders per week' },
    } as Input);
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).toContain('ColumnChart');
    expect(JSON.stringify(result)).toContain('Orders per week');
  });

  it('rejects an invalid chart type at the schema', () => {
    const schema = visualizeDataTool.inputSchema;
    expect(
      schema.safeParse({ chartType: 'Pyramid', data: TABLE }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        chartType: 'PieChart',
        data: TABLE,
        options: { title: 'x' },
      }).success
    ).toBe(true);
  });

  it('reports a row whose cell count differs from the columns', async () => {
    const result = await visualizeDataTool.execute({
      chartType: 'BarChart',
      data: { cols: TABLE.cols, rows: [{ c: [{ v: 'only one' }] }] },
    } as Input);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain(
      'Row 0 has 1 cells'
    );
  });

  it('reports empty columns', async () => {
    const result = await visualizeDataTool.execute({
      chartType: 'BarChart',
      data: { cols: [], rows: [] },
    } as unknown as Input);
    expect(result.success).toBe(false);
  });
});
