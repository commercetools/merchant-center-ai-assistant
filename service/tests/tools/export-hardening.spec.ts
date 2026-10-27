/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { exportDataTool, neutraliseFormula, safeFilename } from '../../src/tools/export.tool';

type Result = {
  success: boolean;
  content?: string;
  filename?: string;
  error?: string;
  hint?: string;
};

const run = (data: Record<string, unknown>[], filename?: string): Promise<Result> =>
  exportDataTool.execute({ data, headers: ['name'], format: 'csv', filename }) as Promise<Result>;

const lines = async (data: Record<string, unknown>[]): Promise<string[]> => {
  const r = await run(data);
  return Buffer.from(r.content ?? '', 'base64').toString('utf-8').split('\n');
};

describe('formula injection', () => {
  it.each([
    ['=cmd|calc', "'=cmd|calc"],
    ['+1', "'+1"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tTab', "'\tTab"],
    ['\rCR', "'\rCR"],
  ])('prefixes a quote to %j', (input, expected) => {
    expect(neutraliseFormula(input)).toBe(expected);
  });

  it('the HYPERLINK cell starts with \'=HYPERLINK inside quotes', async () => {
    const rows = await lines([{ name: '=HYPERLINK("http://x","y")' }]);
    expect(rows[1]).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it('a negative number is untouched, a plain string is untouched', async () => {
    expect(await lines([{ name: -12.5 }])).toEqual(['name', '-12.5']);
    expect(await lines([{ name: 'Anna' }, { name: 5 }])).toEqual(['name', 'Anna', '5']);
  });

  it('header cells are neutralised too', async () => {
    const r = (await exportDataTool.execute({
      data: [{ '=x': 1 }],
      headers: ['=x'],
      format: 'csv',
    })) as Result;
    expect(Buffer.from(r.content ?? '', 'base64').toString()).toBe("'=x\n1");
  });
});

describe('RFC 4180 quoting is unchanged', () => {
  it('doubles quotes and wraps commas', async () => {
    expect((await lines([{ name: 'He said "hi", ok' }]))[1]).toBe('"He said ""hi"", ok"');
  });
});

describe('filename', () => {
  it('sanitises path characters', async () => {
    expect((await run([{ name: 'a' }], '../../etc/passwd')).filename).toBe('etc_passwd.csv');
    expect(safeFilename('weird name (1).txt')).toBe('weird_name_1_.txt');
    expect(safeFilename('x'.repeat(200)).length).toBe(80);
    expect(safeFilename('...')).toBe('export');
    expect(safeFilename(undefined)).toBe('export');
    expect(safeFilename('Ärger-Übersicht')).toBe('Arger-Ubersicht');
  });
});

describe('caps', () => {
  it('rejects 80,000 rows with a hint to filter or aggregate', async () => {
    const r = await run(Array.from({ length: 80_000 }, (_, i) => ({ name: i })));
    expect(r.success).toBe(false);
    expect(r.error).toContain('80000');
    expect(r.hint).toMatch(/filter or aggregate/i);
  });

  it('rejects content whose encoded size exceeds 5 MB', async () => {
    const r = await run(Array.from({ length: 10 }, () => ({ name: 'x'.repeat(600_000) })));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/too large/);
  });

  it('50,000 small rows are accepted', async () => {
    const r = await run(Array.from({ length: 50_000 }, () => ({ name: 'a' })));
    expect(r.success).toBe(true);
  });
});
