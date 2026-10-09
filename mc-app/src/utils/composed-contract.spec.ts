/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  hasOwnReturnStatement,
  isUsableTranspiledCode,
} from './babel-renderer';

// The shared contract fixture is written by the service (change M). mc-app cannot import
// the service module (separate build context), so the shared values are checked against it.
const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../contract/composed-page.fixture.json'),
    'utf8'
  )
) as {
  containerKey: string;
  storedValue: {
    schema: {
      components: Array<{ name: string; code: { transpiledCode: string } }>;
    };
  };
};

const decode = (b64: string): string =>
  Buffer.from(b64, 'base64').toString('utf8');

describe('composed page contract', () => {
  it('uses the container key of the shared fixture', async () => {
    // constants.ts resolves the entry point path while it loads.
    process.env.ENTRY_POINT_URI_PATH = 'ai-assistant';
    const { SHARED_COMPOSED_PAGES_CONTAINER_KEY } = await import(
      '../constants'
    );
    expect(SHARED_COMPOSED_PAGES_CONTAINER_KEY).toBe(fixture.containerKey);
  });

  it('accepts the service transpiled code of a component with hooks before its return', () => {
    const [component] = fixture.storedValue.schema.components;
    const script = decode(component.code.transpiledCode);
    expect(script).toContain('useState');
    expect(isUsableTranspiledCode(script, component.name)).toBe(true);
  });

  it('rejects a script that is not shaped as the contract says', () => {
    expect(
      isUsableTranspiledCode('function Main() { return 1; }', 'Main')
    ).toBe(false);
    expect(isUsableTranspiledCode('function Other() {}\nOther;', 'Main')).toBe(
      false
    );
    expect(isUsableTranspiledCode('function Main( {', 'Main')).toBe(false);
    expect(isUsableTranspiledCode('function Main() {}\nMain;', 'Main')).toBe(
      true
    );
  });

  it('wraps a body by its own return statement, not by the text "return "', () => {
    expect(hasOwnReturnStatement('useState(0);\nreturn <p />;')).toBe(true);
    expect(hasOwnReturnStatement('const f = () => { return 1; };')).toBe(false);
    expect(hasOwnReturnStatement('<div>please return (soon)</div>')).toBe(
      false
    );
  });
});
