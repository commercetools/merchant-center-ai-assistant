/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ConflictError } from './errors';
import { backoffMs, sleep } from './retry';
import { ObjectGateway, StoredObject } from './types';

/** Returned by a mutate function to abort without writing. */
export const SKIP = Symbol('skip');

export interface UpdateOptions {
  attempts?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface UpdateResult<V> {
  value: V;
  /** The stored object after the write, or the unchanged one when `mutate` returned SKIP. */
  object: StoredObject | null;
  written: boolean;
}

/**
 * Optimistic read-modify-write: read, mutate, write with the version that was read, and on a
 * conflict re-read and re-apply (jittered exponential backoff, 5 attempts by default).
 * `mutate` can run several times and must be pure. Creating (no current object) writes
 * without a version; a creation race surfaces as `ConflictError` from the gateway and is retried.
 */
export async function updateWithRetry<V>(
  gw: ObjectGateway,
  container: string,
  key: string,
  mutate: (current: V | null) => V | typeof SKIP,
  o: UpdateOptions = {}
): Promise<UpdateResult<V | null>> {
  const attempts = o.attempts ?? 5;
  const wait = o.sleep ?? sleep;
  for (let attempt = 0; ; attempt++) {
    const current = await gw.get(container, key);
    const next = mutate(current ? (current.value as V) : null);
    if (next === SKIP) {
      return {
        value: current ? (current.value as V) : null,
        object: current,
        written: false,
      };
    }
    try {
      const object = await gw.put(container, key, next, {
        ifVersion: current?.version,
      });
      return { value: next, object, written: true };
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt + 1 >= attempts) throw e;
      await wait(backoffMs(attempt, o.baseMs ?? 40, o.random));
    }
  }
}
