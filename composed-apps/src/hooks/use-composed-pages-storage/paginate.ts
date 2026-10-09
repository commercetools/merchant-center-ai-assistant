/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Pure helpers for loading the composed pages list in several GraphQL requests.
 *
 * Custom Object `offset` is capped at 10,000; the list stops at MAX_PAGES (500) and the UI
 * tells the user when more pages exist.
 */

export const PAGE_SIZE = 100;
export const MAX_PAGES = 500;

/** Offsets of the requests that follow the first one (offset 0), in order. */
export function remainingOffsets(total: number): number[] {
  const wanted = Math.min(Math.max(total, 0), MAX_PAGES);
  const offsets: number[] = [];
  for (let offset = PAGE_SIZE; offset < wanted; offset += PAGE_SIZE) {
    offsets.push(offset);
  }
  return offsets;
}

/** True when the container holds more pages than the list loads. */
export function isTruncated(total: number): boolean {
  return total > MAX_PAGES;
}

type TPage<T> = { total: number; results: T[] };

/**
 * Loads every page (up to MAX_PAGES) with one request per PAGE_SIZE rows.
 * `fetchPage` returns the rows of one request and the container total.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<TPage<T>>
): Promise<{ results: T[]; total: number; truncated: boolean }> {
  const first = await fetchPage(0, PAGE_SIZE);
  const results = [...first.results];
  for (const offset of remainingOffsets(first.total)) {
    const next = await fetchPage(offset, PAGE_SIZE);
    results.push(...next.results);
  }
  return {
    results: results.slice(0, MAX_PAGES),
    total: first.total,
    truncated: isTruncated(first.total),
  };
}
