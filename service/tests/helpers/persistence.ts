/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createPersistence, Persistence } from '../../src/persistence';
import { MemoryObjectGateway } from '../../src/persistence/gateway/memory.gateway';
import type { ObjectGateway } from '../../src/persistence/gateway/types';
import { freshConfig } from './env';

/** A persistence layer over a (possibly wrapped) in-memory gateway. */
export function makePersistence(
  wrap: (gw: MemoryObjectGateway) => ObjectGateway = (gw) => gw,
  extraEnv: NodeJS.ProcessEnv = {}
): { p: Persistence; mem: MemoryObjectGateway } {
  const mem = new MemoryObjectGateway();
  const p = createPersistence(freshConfig(extraEnv), { gateway: wrap(mem) });
  return { p, mem };
}

/** Wraps a gateway and counts or intercepts calls. */
export function spyGateway(
  inner: ObjectGateway,
  hooks: {
    onPut?: (container: string, key: string) => void | Promise<void>;
    onDelete?: (container: string, key: string) => void | Promise<void>;
    onQuery?: (container: string) => void;
  } = {}
): ObjectGateway & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    get: (c, k) => {
      calls.push(`get ${c}/${k}`);
      return inner.get(c, k);
    },
    async put(c, k, v, o) {
      calls.push(`put ${c}/${k}`);
      await hooks.onPut?.(c, k);
      return inner.put(c, k, v, o);
    },
    async delete(c, k, o) {
      calls.push(`delete ${c}/${k}`);
      await hooks.onDelete?.(c, k);
      return inner.delete(c, k, o);
    },
    query: (c, q) => {
      calls.push(`query ${c}`);
      hooks.onQuery?.(c);
      return inner.query(c, q);
    },
  };
}

export const session = (id: string, userId: string, extra: object = {}) => ({
  id,
  userId,
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 1 as const,
  ...extra,
});
