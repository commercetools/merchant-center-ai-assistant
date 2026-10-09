/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

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
