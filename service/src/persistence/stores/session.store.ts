/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import { SKIP, updateWithRetry } from '../gateway/cas';
import {
  ConflictError,
  NotFoundError,
  QueryLimitError,
} from '../gateway/errors';
import type { ObjectFilter } from '../gateway/types';
import { MAX_OFFSET, PAGE } from '../limits';
import { assertSafeId } from '../names';
import {
  FeatureFlags,
  SessionRecord,
  sessionFromValue,
  sessionToValue,
} from '../types/session';
import type { StoreDeps } from './deps';

export interface SessionStore {
  /** `ConflictError` if the session exists. */
  create(s: SessionRecord): Promise<void>;
  get(id: string): Promise<SessionRecord | null>;
  /** Optimistic read-modify-write; `NotFoundError` when absent. `mutate` must be pure. */
  update(
    id: string,
    mutate: (cur: SessionRecord) => SessionRecord | typeof SKIP
  ): Promise<SessionRecord>;
  /** Best effort: failures are logged, never thrown. */
  touch(id: string): Promise<void>;
  listByUser(
    userId: string,
    o?: { limit?: number; featureFlags?: FeatureFlags }
  ): Promise<SessionRecord[]>;
  listAll(o: {
    limit: number;
    offset?: number;
    userId?: string;
    createdBefore?: string;
    createdAfter?: string;
  }): Promise<{ items: SessionRecord[]; total: number }>;
  /** The object only; use `deleteSessionCascade` to remove the messages as well. */
  delete(id: string): Promise<boolean>;
}

/** No request flags: only sessions without flags. Request flags: every given key must equal. */
export function matchesFlags(
  sessionFlags: FeatureFlags | undefined,
  requested: FeatureFlags | undefined
): boolean {
  const asked = Object.entries(requested ?? {}).filter(([, v]) => v !== undefined);
  const have = Object.entries(sessionFlags ?? {}).filter(([, v]) => v !== undefined);
  if (asked.length === 0) return have.length === 0;
  const flags = (sessionFlags ?? {}) as Record<string, unknown>;
  return asked.every(([k, v]) => flags[k] === v);
}

export class GatewaySessionStore implements SessionStore {
  constructor(
    private readonly deps: StoreDeps,
    private readonly now: () => number = Date.now
  ) {}

  private get container(): string {
    return this.deps.c.sessions();
  }

  async create(s: SessionRecord): Promise<void> {
    const id = assertSafeId(s.id);
    assertSafeId(s.userId);
    await updateWithRetry<Record<string, unknown>>(
      this.deps.gw,
      this.container,
      id,
      (cur) => {
        if (cur) throw new ConflictError('Session already exists');
        return sessionToValue(s);
      }
    );
  }

  async get(id: string): Promise<SessionRecord | null> {
    const obj = await this.deps.gw.get(this.container, assertSafeId(id));
    return obj ? sessionFromValue(obj.value) : null;
  }

  async update(
    id: string,
    mutate: (cur: SessionRecord) => SessionRecord | typeof SKIP
  ): Promise<SessionRecord> {
    const result = await updateWithRetry<Record<string, unknown>>(
      this.deps.gw,
      this.container,
      assertSafeId(id),
      (cur) => {
        if (!cur) throw new NotFoundError('Session not found');
        const next = mutate(sessionFromValue(cur));
        if (next === SKIP) return SKIP;
        return sessionToValue({ ...next, id, updatedAt: this.now() });
      }
    );
    return sessionFromValue(result.value);
  }

  async touch(id: string): Promise<void> {
    try {
      await this.update(id, (s) => ({ ...s }));
    } catch (e) {
      logger.warn(`persistence: session touch failed (${(e as Error).name})`);
    }
  }

  async listByUser(
    userId: string,
    o: { limit?: number; featureFlags?: FeatureFlags } = {}
  ): Promise<SessionRecord[]> {
    const limit = Math.min(Math.max(o.limit ?? PAGE, 1), PAGE);
    const filters: ObjectFilter[] = [
      { kind: 'valueEquals', path: 'userId', value: assertSafeId(userId) },
    ];
    const out: SessionRecord[] = [];
    for (let offset = 0; offset <= MAX_OFFSET && out.length < limit; offset += PAGE) {
      const page = await this.deps.gw.query(this.container, {
        filters,
        sort: { field: 'lastModifiedAt', dir: 'desc' },
        limit: PAGE,
        offset,
      });
      for (const obj of page.results) {
        const s = sessionFromValue(obj.value);
        // Flags are matched here, never with negation predicates (slow on the platform).
        if (matchesFlags(s.featureFlags, o.featureFlags)) out.push(s);
        if (out.length >= limit) break;
      }
      if (page.results.length < PAGE) break;
    }
    return out;
  }

  async listAll(o: {
    limit: number;
    offset?: number;
    userId?: string;
    createdBefore?: string;
    createdAfter?: string;
  }): Promise<{ items: SessionRecord[]; total: number }> {
    const offset = o.offset ?? 0;
    if (offset + o.limit > MAX_OFFSET) {
      throw new QueryLimitError(`offset + limit must not exceed ${MAX_OFFSET}`);
    }
    const filters: ObjectFilter[] = [];
    if (o.userId !== undefined) {
      filters.push({ kind: 'valueEquals', path: 'userId', value: assertSafeId(o.userId) });
    }
    if (o.createdBefore) {
      filters.push({ kind: 'time', field: 'createdAt', op: '<', iso: o.createdBefore });
    }
    if (o.createdAfter) {
      filters.push({ kind: 'time', field: 'createdAt', op: '>', iso: o.createdAfter });
    }
    const page = await this.deps.gw.query(this.container, {
      filters,
      sort: { field: 'createdAt', dir: 'desc' },
      limit: o.limit,
      offset,
      withTotal: true,
    });
    return {
      items: page.results.map((r) => sessionFromValue(r.value)),
      total: page.total ?? page.results.length,
    };
  }

  async delete(id: string): Promise<boolean> {
    const gone = await this.deps.gw.delete(this.container, assertSafeId(id));
    return gone !== null;
  }
}
