/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  MAX_PAGES,
  PAGE_SIZE,
  fetchAllPages,
  isTruncated,
  remainingOffsets,
} from './paginate';

const fakeFetch = (total: number) =>
  jest.fn(async (offset: number, limit: number) => ({
    total,
    results: Array.from(
      { length: Math.max(0, Math.min(limit, total - offset)) },
      (_, i) => offset + i
    ),
  }));

describe('remainingOffsets', () => {
  it('is empty when one request is enough', () => {
    expect(remainingOffsets(0)).toEqual([]);
    expect(remainingOffsets(100)).toEqual([]);
  });

  it('lists the follow-up offsets', () => {
    expect(remainingOffsets(101)).toEqual([100]);
    expect(remainingOffsets(250)).toEqual([100, 200]);
  });

  it('stops at the cap', () => {
    expect(remainingOffsets(5000)).toEqual([100, 200, 300, 400]);
  });
});

describe('fetchAllPages', () => {
  it('uses three requests for 250 pages', async () => {
    const fetchPage = fakeFetch(250);
    const result = await fetchAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.results).toHaveLength(250);
    expect(result.truncated).toBe(false);
  });

  it('is truncated above 500 pages and loads only 500', async () => {
    const fetchPage = fakeFetch(731);
    const result = await fetchAllPages(fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(MAX_PAGES / PAGE_SIZE);
    expect(result.results).toHaveLength(MAX_PAGES);
    expect(result.total).toBe(731);
    expect(result.truncated).toBe(true);
  });
});

describe('isTruncated', () => {
  it('flags only totals above the cap', () => {
    expect(isTruncated(500)).toBe(false);
    expect(isTruncated(501)).toBe(true);
  });
});
