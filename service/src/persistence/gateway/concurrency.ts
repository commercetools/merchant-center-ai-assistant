/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Runs `fn` over `items` with at most `limit` calls in flight. After the first rejection no
 * new work is scheduled; calls already running finish and the first error is rethrown.
 * Results keep the order of `items`.
 */
export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;

  const worker = async (): Promise<void> => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        if (!failed) {
          failed = true;
          firstError = e;
        }
        return;
      }
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    worker
  );
  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}
