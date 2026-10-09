/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import {
  isBabelLoaded,
  resetBabelForTests,
  setTransformForTests,
  transpileComponent,
  wrapInNamedComponent,
} from '../../src/composed-pages/transpile';

describe('lazy transpiler', () => {
  it('does not load Babel on import, only on the first call', async () => {
    resetBabelForTests();
    // The tool module (and everything it imports) is loaded here.
    await import('../../src/composed-pages/tool');
    expect(isBabelLoaded()).toBe(false);
    const result = await transpileComponent('Foo', 'return <Text>Hi</Text>;');
    expect(result.success).toBe(true);
    expect(isBabelLoaded()).toBe(true);
  });

  it('emits no JSX tags and keeps the function + name shape', async () => {
    const result = await transpileComponent(
      'Foo',
      'return <Stack gap="400"><Text>Hi</Text></Stack>;'
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.code).toContain('function Foo(');
      expect(result.code.trimEnd().endsWith('Foo;')).toBe(true);
      expect(result.code).not.toMatch(/<[A-Za-z]/);
      expect(result.code).toContain('React.createElement');
    }
  });

  it('wraps the body in the documented signature', () => {
    expect(wrapInNamedComponent('A', 'return null;')).toContain(
      'function A({ renderData, dispatchUIAction }) {'
    );
  });

  it('returns an error instead of throwing on a syntax error', async () => {
    const result = await transpileComponent('Foo', 'return <Stack>;');
    expect(result.success).toBe(false);
  });

  it('returns an error instead of hanging when the timeout is exceeded', async () => {
    setTransformForTests(() => new Promise(() => undefined));
    try {
      const result = await transpileComponent('Foo', 'return null;', 20);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatch(/timed out/);
    } finally {
      setTransformForTests(undefined);
    }
  });

  it('transpiles a 200-line component quickly after warm-up', async () => {
    const lines = Array.from({ length: 190 }, (_, i) => `const v${i} = ${i};`);
    const body = `${lines.join('\n')}\nreturn <Text>{v1}</Text>;`;
    await transpileComponent('Warm', 'return null;');
    const started = Date.now();
    const result = await transpileComponent('Big', body);
    expect(result.success).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
