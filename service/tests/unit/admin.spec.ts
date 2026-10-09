/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isAdminUser, parseAdminUserIds } from '../../src/auth/admin';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u-${i}`).join(',');
const set = (...v: string[]) => new Set(v);

describe('parseAdminUserIds', () => {
  it.each([[undefined], [''], ['   '], ['\n ']])('%j means nobody', (raw) => {
    expect(parseAdminUserIds(raw)).toEqual({ value: set(), errors: [] });
  });

  it('normalises the spec example', () => {
    expect(parseAdminUserIds(' u1, u2 ;u1,, ').value).toEqual(set('u1', 'u2'));
  });

  it('tolerates newlines around entries', () => {
    expect(parseAdminUserIds('u-1,\n u-3,').value).toEqual(set('u-1', 'u-3'));
  });

  it('is case sensitive', () => {
    expect(parseAdminUserIds('Abc,abc').value).toEqual(set('Abc', 'abc'));
  });

  it('names the position of an invalid entry, not its text', () => {
    const r = parseAdminUserIds('u1,bad id');
    expect(r.errors).toEqual(['ADMIN_USER_IDS: entry 2 is not a valid user id']);
    expect(r.errors.join()).not.toContain('bad');
  });

  it('rejects an e-mail address', () => {
    const r = parseAdminUserIds('u-1,alice@example.com');
    expect(r.errors).toEqual(['ADMIN_USER_IDS: entry 2 is not a valid user id']);
    expect(r.errors.join()).not.toContain('alice');
  });

  it('accepts 50 entries and rejects 51', () => {
    expect(parseAdminUserIds(ids(50)).errors).toEqual([]);
    expect(parseAdminUserIds(ids(51)).errors).toEqual(['ADMIN_USER_IDS: at most 50 entries']);
  });

  it('accepts 128 characters and rejects 129', () => {
    expect(parseAdminUserIds('a'.repeat(128)).errors).toEqual([]);
    expect(parseAdminUserIds('a'.repeat(129)).errors).toHaveLength(1);
  });
});

describe('isAdminUser', () => {
  const admins = set('u-admin-1', 'u-admin-2');

  it('is true for a listed id', () => {
    expect(isAdminUser('u-admin-2', admins)).toBe(true);
  });
  it('is false for an unlisted id', () => {
    expect(isAdminUser('u-other', admins)).toBe(false);
  });
  it.each(['U-ADMIN-1', 'u-admin-1x', 'u-admin', ' u-admin-1', ''])(
    'is false for the look-alike %j',
    (id) => {
      expect(isAdminUser(id, admins)).toBe(false);
    }
  );
  it('is false for everyone with an empty set', () => {
    expect(isAdminUser('u-admin-1', set())).toBe(false);
  });
});
