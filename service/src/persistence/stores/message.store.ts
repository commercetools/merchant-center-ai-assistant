/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { mapBounded } from '../gateway/concurrency';
import { SessionTooLongError } from '../gateway/errors';
import type { StoredObject } from '../gateway/types';
import { KEYIN_MAX, MAX_OFFSET, MESSAGES_CEILING, PAGE } from '../limits';
import { assertSafeId } from '../names';
import {
  messageFromValue,
  messageToValue,
  StoredMessage,
} from '../types/message';
import type { StoreDeps } from './deps';

export type NewMessage = Omit<StoredMessage, 'timestamp'> & { timestamp?: number };

export interface MessageStore {
  /** Sequential writes in array order; strictly increasing timestamps; upsert by id. */
  put(sessionId: string, messages: NewMessage[]): Promise<StoredMessage[]>;
  get(sessionId: string, id: string): Promise<StoredMessage | null>;
  has(sessionId: string, ids: string[]): Promise<Set<string>>;
  /** Always returned chronologically; `desc` + `limit` reads the newest N. */
  list(
    sessionId: string,
    o?: { limit?: number; order?: 'asc' | 'desc' }
  ): Promise<StoredMessage[]>;
  count(sessionId: string): Promise<number>;
  delete(sessionId: string, id: string): Promise<boolean>;
  deleteAll(sessionId: string): Promise<number>;
}

interface Row {
  createdAt: string;
  message: StoredMessage;
}

/** Server creation time first; only exact ties fall back to our own timestamp and the id. */
const chronological = (a: Row, b: Row): number =>
  a.createdAt < b.createdAt
    ? -1
    : a.createdAt > b.createdAt
      ? 1
      : a.message.timestamp - b.message.timestamp ||
        (a.message.id < b.message.id ? -1 : a.message.id > b.message.id ? 1 : 0);

const toRow = (o: StoredObject): Row => ({
  createdAt: o.createdAt,
  message: messageFromValue(o.value),
});

export class GatewayMessageStore implements MessageStore {
  /** Per-process memo only; correctness comes from the platform's createdAt. */
  private readonly lastTs = new Map<string, number>();

  constructor(private readonly deps: StoreDeps) {}

  async put(sessionId: string, messages: NewMessage[]): Promise<StoredMessage[]> {
    const container = this.deps.c.messages(sessionId);
    let last = this.lastTs.get(sessionId) ?? 0;
    const out: StoredMessage[] = [];
    // Sequential on purpose: one round trip apart gives distinct createdAt values.
    for (const m of messages) {
      const id = assertSafeId(m.id);
      const timestamp = Math.max(m.timestamp ?? Date.now(), last + 1);
      last = timestamp;
      const stored: StoredMessage = { id, role: m.role, parts: m.parts, timestamp };
      await this.deps.gw.put(container, id, messageToValue(stored));
      out.push(stored);
    }
    this.lastTs.set(sessionId, last);
    return out;
  }

  async get(sessionId: string, id: string): Promise<StoredMessage | null> {
    const obj = await this.deps.gw.get(
      this.deps.c.messages(sessionId),
      assertSafeId(id)
    );
    return obj ? messageFromValue(obj.value) : null;
  }

  async has(sessionId: string, ids: string[]): Promise<Set<string>> {
    const container = this.deps.c.messages(sessionId);
    const unique = [...new Set(ids.map(assertSafeId))];
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += KEYIN_MAX) {
      chunks.push(unique.slice(i, i + KEYIN_MAX));
    }
    const pages = await mapBounded(chunks, this.deps.concurrency, (keys) =>
      this.deps.gw.query(container, {
        filters: [{ kind: 'keyIn', keys }],
        limit: KEYIN_MAX,
      })
    );
    return new Set(pages.flatMap((p) => p.results.map((r) => r.key)));
  }

  async list(
    sessionId: string,
    o: { limit?: number; order?: 'asc' | 'desc' } = {}
  ): Promise<StoredMessage[]> {
    const container = this.deps.c.messages(sessionId);
    const dir = o.order ?? 'asc';
    const wanted = o.limit ?? Number.POSITIVE_INFINITY;
    const rows: Row[] = [];
    let offset = 0;
    while (rows.length < wanted) {
      if (offset >= MESSAGES_CEILING) {
        // A full ceiling's worth was read; a full read must not silently drop the rest.
        if (o.limit === undefined) {
          const more = await this.deps.gw.query(container, {
            sort: { field: 'createdAt', dir },
            limit: 1,
            offset: MAX_OFFSET,
          });
          if (more.results.length > 0) {
            throw new SessionTooLongError('Session has more messages than can be read');
          }
        }
        break;
      }
      const want = Math.min(PAGE, wanted - rows.length);
      const page = await this.deps.gw.query(container, {
        sort: { field: 'createdAt', dir },
        limit: want,
        offset,
      });
      rows.push(...page.results.map(toRow));
      if (page.results.length < want) break;
      offset += want;
    }
    return rows.sort(chronological).map((r) => r.message);
  }

  async count(sessionId: string): Promise<number> {
    const page = await this.deps.gw.query(this.deps.c.messages(sessionId), {
      limit: 1,
      withTotal: true,
    });
    return page.total ?? page.results.length;
  }

  async delete(sessionId: string, id: string): Promise<boolean> {
    const gone = await this.deps.gw.delete(
      this.deps.c.messages(sessionId),
      assertSafeId(id)
    );
    return gone !== null;
  }

  async deleteAll(sessionId: string): Promise<number> {
    const container = this.deps.c.messages(sessionId);
    let deleted = 0;
    // No offset: each round lists the first page of what is left.
    for (;;) {
      const page = await this.deps.gw.query(container, {
        sort: { field: 'key', dir: 'asc' },
        limit: PAGE,
      });
      if (page.results.length === 0) break;
      const results = await mapBounded(page.results, this.deps.concurrency, (r) =>
        this.deps.gw.delete(container, r.key)
      );
      deleted += results.filter((r) => r !== null).length;
    }
    this.lastTs.delete(sessionId);
    return deleted;
  }
}
