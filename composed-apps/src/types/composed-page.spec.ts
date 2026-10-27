/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isPageSchemaV5, type TPageSchema } from './composed-page';

const schemaOf = (value: unknown) => value as TPageSchema;
const component = { id: 'c1', name: 'Orders', componentBody: 'return null;' };

describe('isPageSchemaV5', () => {
  it('accepts version 5.0 with components', () => {
    expect(
      isPageSchemaV5(schemaOf({ version: '5.0', components: [component] }))
    ).toBe(true);
  });

  it('rejects other versions', () => {
    expect(
      isPageSchemaV5(schemaOf({ version: '4.0', components: [component] }))
    ).toBe(false);
    expect(isPageSchemaV5(schemaOf({ version: 'unknown' }))).toBe(false);
  });

  it('rejects an empty component list', () => {
    expect(isPageSchemaV5(schemaOf({ version: '5.0', components: [] }))).toBe(
      false
    );
  });
});
