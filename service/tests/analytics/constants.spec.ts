/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import * as a from '../../src/analytics/constants';
import * as s from '../../src/storage/constants';

describe('spec-normative constants', () => {
  it('analytics caps', () => {
    expect(a.OFFLOAD_MAX_ROWS).toBe(20_000);
    expect(a.OFFLOAD_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(a.INSERT_CHUNK_ROWS).toBe(500);
    expect(a.TABLE_TTL_MS).toBe(7 * 24 * 3600_000);
    expect(a.QUERY_MAX_BYTES_BILLED).toBe('200000000');
    expect(a.QUERY_JOB_TIMEOUT_MS).toBe(60_000);
    expect(a.QUERY_MAX_ROWS).toBe(500);
    expect(a.QUERY_RESULT_MAX_BYTES).toBe(256 * 1024);
    expect(a.EXPORT_MAX_ROWS).toBe(50_000);
    expect(a.EXPORT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(a.CLEANUP_CONCURRENCY).toBe(4);
  });

  it('storage caps and allow-list', () => {
    expect(s.IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect([...s.IMAGE_TYPES]).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    expect(s.FILES_PATH_PREFIX).toBe('/files');
  });

  it('file name pattern', () => {
    expect(s.FILE_NAME_PATTERN.test('1700000000000-ab12cd34.png')).toBe(true);
    expect(s.FILE_NAME_PATTERN.test('1700000000000-ab12cd34.svg')).toBe(false);
    expect(s.FILE_NAME_PATTERN.test('..%2Fx.png')).toBe(false);
  });
});
