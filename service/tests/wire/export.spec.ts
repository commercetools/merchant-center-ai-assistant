/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { exportDataTool } from '../../src/tools/export.tool';

type Input = Parameters<typeof exportDataTool.execute>[0];
const run = (input: Partial<Input>) =>
  exportDataTool.execute({ format: 'csv', ...input } as Input);

const decode = (content: string) => Buffer.from(content, 'base64').toString('utf-8');

describe('export_data', () => {
  it('escapes commas, quotes and newlines in CSV', async () => {
    const result = await run({
      data: [
        { name: 'a,b', note: 'say "hi"', extra: 'line1\nline2', skipped: 'x' },
      ],
      headers: ['name', 'note', 'extra'],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const csv = decode(result.content);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"line1\nline2"');
    expect(csv).not.toContain('skipped');
    expect(result.rowCount).toBe(1);
    expect(result.columnCount).toBe(3);
    expect(result.filename).toBe('export.csv');
    expect(result.mimeType).toContain('csv');
  });

  it('uses the given filename', async () => {
    const result = await run({ data: [{ a: 1 }], headers: ['a'], filename: 'orders' });
    expect(result.success && result.filename).toBe('orders.csv');
  });

  it('rejects empty data', async () => {
    const result = await run({ data: [], headers: ['a'] });
    expect(result).toMatchObject({ success: false, error: 'No data provided for export' });
    expect(result.success === false && result.hint).toBeTruthy();
  });

  it('rejects empty headers', async () => {
    const result = await run({ data: [{ a: 1 }], headers: [] });
    expect(result).toMatchObject({ success: false, error: 'No headers provided for export' });
  });

  it('rejects headers that match no key of the first row', async () => {
    const result = await run({ data: [{ a: 1 }], headers: ['nope'] });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toContain('None of the specified headers');
  });

  it('exports a header missing from the first row as an empty cell', async () => {
    const result = await run({ data: [{ a: 1 }], headers: ['a', 'nope'] });
    expect(result.success).toBe(true);
  });
});
