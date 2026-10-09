/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import { isProductionEnv } from '../../config/runtime';
import { MAX_OFFSET } from '../limits';
import { assertSafeName } from '../names';
import { ConflictError } from './errors';
import { validateQuery } from './query';
import { checkSize } from './size';
import { ObjectFilter, ObjectGateway, ObjectQuery, StoredObject } from './types';

/** Drops `null` (and, through JSON, `undefined`) object members; array elements are kept. */
function stripNullMembers(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNullMembers);
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, member] of Object.entries(v)) {
      if (member !== null) out[k] = stripNullMembers(member);
    }
    return out;
  }
  return v;
}

/**
 * Round trip through JSON so `undefined` members vanish, and `null` members are removed as
 * the real service does not save them.
 */
const roundTrip = <T>(v: T): T =>
  stripNullMembers(JSON.parse(JSON.stringify(v))) as T;

function walk(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const seg of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function matches(o: StoredObject, f: ObjectFilter): boolean {
  switch (f.kind) {
    case 'valueEquals':
      return walk(o.value, f.path) === f.value;
    case 'keyIn':
      return f.keys.includes(o.key);
    case 'time': {
      const t = Date.parse(o[f.field]);
      const ref = Date.parse(f.iso);
      return f.op === '<' ? t < ref : f.op === '<=' ? t <= ref : f.op === '>' ? t > ref : t >= ref;
    }
  }
}

/**
 * In-memory stand-in for the Custom Objects API used by tests and by `PERSISTENCE_DRIVER=memory`
 * (local development). It emulates versions, strictly monotonic millisecond timestamps, conflicts
 * and the three filter kinds. Refused in production.
 */
export class MemoryObjectGateway implements ObjectGateway {
  private readonly data = new Map<string, Map<string, StoredObject>>();
  private lastMs = 0;

  constructor(private readonly now: () => number = Date.now) {
    if (isProductionEnv()) {
      throw new Error('MemoryObjectGateway must not be used when NODE_ENV=production');
    }
  }

  /** Strictly increasing millisecond clock, so ordering by createdAt is deterministic. */
  private tick(): string {
    this.lastMs = Math.max(this.now(), this.lastMs + 1);
    return new Date(this.lastMs).toISOString();
  }

  async get(container: string, key: string): Promise<StoredObject | null> {
    const found = this.data.get(assertSafeName(container))?.get(assertSafeName(key));
    return found ? roundTrip(found) : null;
  }

  async put(
    container: string,
    key: string,
    value: unknown,
    o?: { ifVersion?: number }
  ): Promise<StoredObject> {
    const c = assertSafeName(container);
    const k = assertSafeName(key);
    checkSize(c, value);
    const bucket = this.data.get(c) ?? new Map<string, StoredObject>();
    const existing = bucket.get(k);
    if (o?.ifVersion !== undefined && (!existing || existing.version !== o.ifVersion)) {
      throw new ConflictError('Conflict, please retry', existing?.version);
    }
    const stamp = this.tick();
    const next: StoredObject = {
      id: existing?.id ?? randomUUID(),
      version: (existing?.version ?? 0) + 1,
      container: c,
      key: k,
      value: roundTrip(value),
      createdAt: existing?.createdAt ?? stamp,
      lastModifiedAt: stamp,
    };
    bucket.set(k, next);
    this.data.set(c, bucket);
    return roundTrip(next);
  }

  async delete(
    container: string,
    key: string,
    o?: { ifVersion?: number }
  ): Promise<StoredObject | null> {
    const c = assertSafeName(container);
    const k = assertSafeName(key);
    const bucket = this.data.get(c);
    const existing = bucket?.get(k);
    if (!bucket || !existing) return null;
    if (o?.ifVersion !== undefined && existing.version !== o.ifVersion) {
      throw new ConflictError('Conflict, please retry', existing.version);
    }
    bucket.delete(k);
    if (bucket.size === 0) this.data.delete(c);
    return roundTrip(existing);
  }

  async query(
    container: string,
    q: ObjectQuery
  ): Promise<{ results: StoredObject[]; total?: number }> {
    const c = assertSafeName(container);
    validateQuery(q);
    const filters = q.filters ?? [];
    let rows = [...(this.data.get(c)?.values() ?? [])].filter((o) =>
      filters.every((f) => matches(o, f))
    );
    if (q.sort) {
      const { field, dir } = q.sort;
      const sign = dir === 'asc' ? 1 : -1;
      rows = rows.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        return av < bv ? -sign : av > bv ? sign : 0;
      });
    }
    const offset = q.offset ?? 0;
    const page = rows.slice(offset, offset + q.limit).map((o) => roundTrip(o));
    if (!q.withTotal) return { results: page };
    // The platform caps the total of a predicate query at the maximum offset.
    return {
      results: page,
      total: filters.length > 0 ? Math.min(rows.length, MAX_OFFSET) : rows.length,
    };
  }

  /** Test helper: container names currently holding at least one object. */
  containerNames(): string[] {
    return [...this.data.keys()];
  }
}
