/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  validateComponentBody,
  validateDataSourceQuery,
} from '../../src/composed-pages/validate';

const message = (body: string, name = 'Main'): string => {
  const result = validateComponentBody(body, name);
  return result.valid ? '' : result.error.message;
};

describe('validateComponentBody', () => {
  it('accepts a pure return and a hooks component', () => {
    expect(validateComponentBody('return <Text>Hi</Text>;').valid).toBe(true);
    expect(
      validateComponentBody(
        'const [a] = useState(1);\nreturn <Text>{a}</Text>;'
      ).valid
    ).toBe(true);
  });

  it('rejects a body whose only return sits inside a hook callback', () => {
    expect(message('const x = useMemo(() => { return 1; }, []);')).toMatch(
      /top-level return/
    );
  });

  it('accepts forbidden words in strings and comments', () => {
    expect(
      validateComponentBody(
        '// never use window here\nreturn <Text>Do not use window.open</Text>;'
      ).valid
    ).toBe(true);
    expect(
      validateComponentBody('return <Text>{"document"}</Text>;').valid
    ).toBe(true);
  });

  it('accepts property names that equal a denied word', () => {
    expect(
      validateComponentBody(
        'const o = { fetch: 1 };\nreturn <Text>{o.fetch}</Text>;'
      ).valid
    ).toBe(true);
  });

  it.each([
    ['window.location.href = "x"; return null;', 'window'],
    ['return <Text>{window["x"]}</Text>;', 'window'],
    ['const g = globalThis; return null;', 'globalThis'],
    ['fetch("/x"); return null;', 'fetch'],
    ['eval("1"); return null;', 'eval'],
    ['const document = 1; return null;', 'document'],
    ['localStorage.getItem("a"); return null;', 'localStorage'],
  ])('rejects %s', (body, word) => {
    expect(message(body)).toContain(`"${word}"`);
  });

  it('rejects constructor chains and dynamic import', () => {
    expect(
      message('const f = [].constructor.constructor; return null;')
    ).toMatch(/constructor/);
    expect(message('const f = x["constructor"]; return null;')).toMatch(
      /constructor/
    );
    expect(message('import("x"); return null;')).toMatch(/import/);
  });

  it('rejects import and export statements with a friendly message', () => {
    expect(message("import { useState } from 'react';\nreturn null;")).toMatch(
      /import or export/
    );
    expect(message('export const a = 1;\nreturn null;')).toMatch(
      /import or export/
    );
  });

  it('rejects its own function declaration of the component', () => {
    expect(message('function Main() { return null; }\nreturn null;')).toMatch(
      /function declaration/
    );
  });

  it('reports line and column of a syntax error relative to the body', () => {
    const result = validateComponentBody(
      'const a = 1;\nreturn <Stack><Text>x</Stack>;'
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.line).toBe(2);
      expect(result.error.column).toBeGreaterThan(0);
      expect(result.error.message).toMatch(/Syntax error/);
    }
  });

  it('rejects an empty body', () => {
    expect(validateComponentBody('  ').valid).toBe(false);
  });
});

describe('validateDataSourceQuery', () => {
  const ds = (query: string, variables?: { name: string }[]) =>
    validateDataSourceQuery({ id: 'x', query, variables });

  it('accepts a valid query and the anonymous shorthand', () => {
    expect(
      ds('query($limit:Int){ products(limit:$limit){ total } }', [
        { name: 'limit' },
      ]).valid
    ).toBe(true);
    expect(ds('{ products { total } }').valid).toBe(true);
    expect(ds('query { a { ...F } } fragment F on A { id }').valid).toBe(true);
  });

  it('rejects a mutation with a read-only hint', () => {
    const result = ds('mutation { deleteCart(id:"x") { id } }');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/read-only/);
  });

  it('rejects subscriptions, fragment-only and syntax errors', () => {
    expect(ds('subscription { a }').valid).toBe(false);
    expect(ds('fragment F on A { id }').valid).toBe(false);
    const syntax = ds('query { a ');
    expect(syntax.valid).toBe(false);
    if (!syntax.valid) expect(syntax.error).toMatch(/syntax/i);
  });

  it('checks declared against used and listed variables', () => {
    expect(ds('query { a(x: $y) { id } }').valid).toBe(false);
    expect(ds('query($a:Int){ x(l:$a){ id } }', [{ name: 'b' }]).valid).toBe(
      false
    );
  });
});
