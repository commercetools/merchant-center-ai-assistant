/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { sanitizeUserLabel } from '../../src/utils/user-label';

describe('sanitizeUserLabel', () => {
  it('removes angle brackets and control characters, collapses whitespace', () => {
    expect(sanitizeUserLabel('  <b>Ann</b>\u0007 Admin  ')).toBe('bAnn/b Admin');
  });

  it('cuts to 120 characters', () => {
    expect(sanitizeUserLabel('a'.repeat(300))).toHaveLength(120);
  });

  it('never splits a surrogate pair at the cut', () => {
    const label = sanitizeUserLabel(`${'a'.repeat(119)}\u{1F600}tail`);
    expect(label).toBe(`${'a'.repeat(119)}\u{1F600}`);
    expect([...(label as string)]).toHaveLength(120);
  });

  it('returns undefined for empty or whitespace-only input', () => {
    expect(sanitizeUserLabel('')).toBeUndefined();
    expect(sanitizeUserLabel('  \n\t ')).toBeUndefined();
    expect(sanitizeUserLabel('<>')).toBeUndefined();
  });

  it('returns undefined for non-strings', () => {
    expect(sanitizeUserLabel(5)).toBeUndefined();
    expect(sanitizeUserLabel(null)).toBeUndefined();
    expect(sanitizeUserLabel({ a: 1 })).toBeUndefined();
  });
});
