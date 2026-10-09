/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  COMPOSED_PAGES_CONTAINER_KEY,
  COMPOSED_PAGE_SCHEMA_VERSION,
  buildComposedPageUri,
  decodeCode,
  encodeCode,
  isSupportedSchema,
  isUsableTranspiledCode,
  parseComposedPageUri,
} from '../../src/composed-pages/contract';
import { transpileComponent } from '../../src/composed-pages/transpile';

describe('composed page uri', () => {
  it('round trips', () => {
    expect(parseComposedPageUri(buildComposedPageUri('k1', 7))).toEqual({
      key: 'k1',
      version: 7,
    });
  });

  it.each([
    'ui://composed-page/k1',
    'ui://composed-page/k1/v',
    'ui://composed-page/a/b/v1',
    'http://composed-page/k1/v1',
    '',
  ])('rejects %p', (uri) => {
    expect(parseComposedPageUri(uri)).toBeNull();
  });
});

describe('constants and encoding', () => {
  it('has the agreed values', () => {
    expect(COMPOSED_PAGE_SCHEMA_VERSION).toBe('5.0');
    expect(COMPOSED_PAGES_CONTAINER_KEY).toBe('shared-composed-pages');
  });

  it('encodes UTF-8 as base64 and back', () => {
    const text = 'return <Text>Grüße 日本語 ✓</Text>;';
    expect(decodeCode(encodeCode(text))).toBe(text);
    expect(encodeCode('abc')).toBe('YWJj');
  });

  it('discriminates on the schema version', () => {
    expect(isSupportedSchema({ version: '5.0' })).toBe(true);
    expect(isSupportedSchema({ version: '9.9' })).toBe(false);
    expect(isSupportedSchema({})).toBe(false);
  });
});

describe('isUsableTranspiledCode', () => {
  it('accepts a hooks component (the case the old client regex rejected)', async () => {
    const result = await transpileComponent(
      'Foo',
      'const [a, setA] = useState(0);\nuseEffect(() => { setA(1); }, []);\nreturn <Text>{a}</Text>;'
    );
    expect(result.success).toBe(true);
    if (result.success)
      expect(isUsableTranspiledCode(result.code, 'Foo')).toBe(true);
  });

  it('accepts a pure return component', async () => {
    const result = await transpileComponent('Foo', 'return <Text>Hi</Text>;');
    expect(result.success).toBe(true);
    if (result.success)
      expect(isUsableTranspiledCode(result.code, 'Foo')).toBe(true);
  });

  it('rejects garbage and mismatches', () => {
    expect(isUsableTranspiledCode('alert(1)', 'Foo')).toBe(false);
    expect(isUsableTranspiledCode('function Foo() {}\nBar;', 'Foo')).toBe(
      false
    );
    expect(isUsableTranspiledCode('function Foo() {}', 'Foo')).toBe(false);
    expect(isUsableTranspiledCode('function Foo( {', 'Foo')).toBe(false);
    expect(isUsableTranspiledCode('function Foo() {}\nFoo;', 'Foo')).toBe(true);
  });
});

describe('module graph', () => {
  it('imports nothing from persistence or commercetools clients', () => {
    const dir = join(process.cwd(), 'src/composed-pages');
    const files = readdirSync(dir, {
      recursive: true,
      encoding: 'utf8',
    }).filter((file) => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      const specifiers = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const specifier of specifiers) {
        expect({
          file,
          specifier,
          bad: /persistence|\/client\/|platform-sdk|ts-client/.test(specifier),
        }).toEqual({
          file,
          specifier,
          bad: false,
        });
      }
    }
  });

  it('contract.ts only imports the parser', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/composed-pages/contract.ts'),
      'utf8'
    );
    expect([...text.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual([
      '@babel/parser',
    ]);
  });
});
