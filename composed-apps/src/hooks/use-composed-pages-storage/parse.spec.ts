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
} from '../../utils/babel-renderer';
import { parseComposedPage } from './parse';

const base = {
  id: 'id-1',
  key: 'e2e-orders',
  container: 'shared-composed-pages',
  version: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastModifiedAt: '2026-01-02T00:00:00.000Z',
};

const schema = { version: '5.0', components: [] };

describe('parseComposedPage', () => {
  it('reads an already parsed object value', () => {
    const page = parseComposedPage({
      ...base,
      value: { name: 'Orders', icon: 'List', schema, isPublished: false },
    });
    expect(page.name).toBe('Orders');
    expect(page.icon).toBe('List');
    expect(page.isPublished).toBe(false);
    expect(page.updatedAt).toBe(base.lastModifiedAt);
    expect(page.schema).toEqual(schema);
  });

  it('parses a string value', () => {
    const page = parseComposedPage({
      ...base,
      value: JSON.stringify({ name: 'Orders', schema }),
    });
    expect(page.name).toBe('Orders');
    expect(page.schema).toEqual(schema);
  });

  it('falls back to the key when the name is missing', () => {
    expect(parseComposedPage({ ...base, value: { schema } }).name).toBe(
      'e2e-orders'
    );
  });

  it('defaults isPublished to true', () => {
    expect(parseComposedPage({ ...base, value: { schema } }).isPublished).toBe(
      true
    );
  });

  it('returns a minimal page for invalid JSON', () => {
    const page = parseComposedPage({ ...base, value: '{not json' });
    expect(page.key).toBe('e2e-orders');
    expect(page.name).toBe('e2e-orders');
    expect(page.isPublished).toBe(false);
    expect(page.schema.version).toBe('unknown');
  });
});

// The shared contract fixture is written by the service; composed-apps cannot
// import the service module, so the stored shape is checked against its own copy of the
// file (the service's drift test keeps the copies identical).
describe('shared composed page fixture', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, 'composed-page.fixture.json'),
      'utf8'
    )
  ) as {
    storedValue: {
      name: string;
      schema: {
        version: string;
        components: Array<{ name: string; code: { transpiledCode: string } }>;
      };
    };
  };

  it('parses the stored value into a page with the contract schema version', () => {
    const page = parseComposedPage({
      ...base,
      value: fixture.storedValue as never,
    });
    expect(page.name).toBe(fixture.storedValue.name);
    expect(page.schema.version).toBe(fixture.storedValue.schema.version);
  });

  it('accepts the service transpiled code of every component (hooks before the return)', () => {
    for (const component of fixture.storedValue.schema.components) {
      const script = Buffer.from(
        component.code.transpiledCode,
        'base64'
      ).toString('utf8');
      expect(isUsableTranspiledCode(script, component.name)).toBe(true);
    }
  });

  it('rejects scripts that are not shaped as the contract says', () => {
    expect(
      isUsableTranspiledCode('function Main() { return 1; }', 'Main')
    ).toBe(false);
    expect(isUsableTranspiledCode('function Main( {', 'Main')).toBe(false);
    expect(isUsableTranspiledCode('function Main() {}\nMain;', 'Main')).toBe(
      true
    );
  });
});

describe('hasOwnReturnStatement', () => {
  it('finds a return after hooks', () => {
    expect(
      hasOwnReturnStatement(
        'const [a, setA] = useState(0);\nreturn <div>{a}</div>;'
      )
    ).toBe(true);
  });

  it('finds a return inside an if block', () => {
    expect(hasOwnReturnStatement('if (x) { return null; }\nconst y = 1;')).toBe(
      true
    );
  });

  it('ignores a return that only lives in an inner function', () => {
    expect(hasOwnReturnStatement('const f = () => { return 1; };\nf();')).toBe(
      false
    );
  });

  it('treats pure JSX that says "return " in its text as pure JSX', () => {
    expect(hasOwnReturnStatement('<div>please return (soon)</div>')).toBe(
      false
    );
  });

  it('answers false for code that does not parse', () => {
    expect(hasOwnReturnStatement('<a/><b/>')).toBe(false);
  });
});
