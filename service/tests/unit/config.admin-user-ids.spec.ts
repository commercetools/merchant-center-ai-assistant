/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { parseAdminUserIds } from '../../src/config/admin-user-ids';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u-${i}`).join(',');

describe('parseAdminUserIds', () => {
  it.each([[undefined], [''], ['   '], ['\n ']])('%j means nobody', (raw) => {
    expect(parseAdminUserIds(raw)).toEqual({ value: [], errors: [] });
  });

  it('tolerates a trailing comma, semicolons, newlines and duplicates', () => {
    expect(parseAdminUserIds(' u-1, u-2 ;u-1,\n u-3,').value).toEqual([
      'u-1',
      'u-2',
      'u-3',
    ]);
  });

  it('is case sensitive', () => {
    expect(parseAdminUserIds('Abc,abc').value).toEqual(['Abc', 'abc']);
  });

  it('names the position of an invalid entry, not its text', () => {
    const r = parseAdminUserIds('u-1,alice@example.com,u-3');
    expect(r.errors).toEqual(['ADMIN_USER_IDS: entry 2 is not a valid user id']);
    expect(r.errors.join()).not.toContain('alice');
  });

  it('rejects an e-mail address', () => {
    expect(parseAdminUserIds('a@b').errors).toHaveLength(1);
  });

  it('accepts 50 entries and rejects 51', () => {
    expect(parseAdminUserIds(ids(50)).errors).toEqual([]);
    expect(parseAdminUserIds(ids(51)).errors).toEqual([
      'ADMIN_USER_IDS: at most 50 entries',
    ]);
  });

  it('accepts 128 characters and rejects 129', () => {
    expect(parseAdminUserIds('a'.repeat(128)).errors).toEqual([]);
    expect(parseAdminUserIds('a'.repeat(129)).errors).toHaveLength(1);
  });

  it('returns a frozen array', () => {
    expect(Object.isFrozen(parseAdminUserIds('u-1').value)).toBe(true);
  });
});

describe('auth.adminUserIds in the configuration', () => {
  it('is empty when unset', () => {
    expect(freshConfig().auth.adminUserIds).toEqual([]);
  });

  it('is parsed from the environment', () => {
    expect(freshConfig({ ADMIN_USER_IDS: ' u-1, u-2 ;u-1,\n u-3,' }).auth.adminUserIds).toEqual([
      'u-1',
      'u-2',
      'u-3',
    ]);
  });

  it('is reported together with other problems without echoing the entry', () => {
    let message = '';
    try {
      freshConfig({ ADMIN_USER_IDS: 'a@b', LOG_LEVEL: 'loud' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('ADMIN_USER_IDS: entry 1 is not a valid user id');
    expect(message).toContain('LOG_LEVEL');
    expect(message).not.toContain('a@b');
    expect(message).not.toContain('loud');
  });
});
