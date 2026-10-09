/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { reassembleSnapshot } from '../feedback/chunks';
import { mapBounded } from '../gateway/concurrency';
import { QueryLimitError } from '../gateway/errors';
import type { ObjectFilter } from '../gateway/types';
import { MAX_OFFSET, PAGE } from '../limits';
import { assertSafeId } from '../names';
import {
  FeedbackListFilters,
  FeedbackListItem,
  FeedbackRecord,
  FeedbackSnapshotChunk,
  FeedbackWithSnapshot,
  feedbackFromValue,
  feedbackListItem,
  feedbackToValue,
} from '../types/feedback';
import { isRecord } from '../types/session';
import type { StoreDeps } from './deps';

export interface FeedbackStore {
  /** Chunks first, parent last: a parent is never visible before all chunks are stored. */
  put(record: FeedbackRecord, chunks: FeedbackSnapshotChunk[]): Promise<void>;
  /** Newest first; list projection only. */
  list(
    f: FeedbackListFilters,
    limit: number,
    offset: number
  ): Promise<{ items: FeedbackListItem[]; total: number }>;
  get(id: string): Promise<FeedbackWithSnapshot | null>;
  /**
   * The parent and the raw chunk payloads in key order, without reassembling (change N
   * reassembles the whole-transcript snapshot itself and checks its digest).
   */
  getParts(id: string): Promise<FeedbackParts | null>;
  /** Parent first, then the chunks; re-runnable. `false` when the parent did not exist. */
  delete(id: string): Promise<boolean>;
}

export interface FeedbackParts {
  record: FeedbackRecord;
  chunks: Array<Pick<FeedbackSnapshotChunk, 'index' | 'chunk' | 'payload'>>;
}

export class GatewayFeedbackStore implements FeedbackStore {
  constructor(private readonly deps: StoreDeps) {}

  async put(record: FeedbackRecord, chunks: FeedbackSnapshotChunk[]): Promise<void> {
    const id = assertSafeId(record.id);
    assertSafeId(record.userId);
    const container = this.deps.c.feedbackSnap(id);
    await mapBounded(chunks, this.deps.concurrency, (c) =>
      this.deps.gw.put(container, c.docId, {
        index: c.index,
        chunk: c.chunk,
        chunks: c.chunks,
        ...(c.role ? { role: c.role } : {}),
        payload: c.payload,
      })
    );
    // Only after every chunk resolved.
    await this.deps.gw.put(this.deps.c.feedback(), id, feedbackToValue(record));
  }

  async list(
    f: FeedbackListFilters,
    limit: number,
    offset: number
  ): Promise<{ items: FeedbackListItem[]; total: number }> {
    if (offset + limit > MAX_OFFSET) {
      throw new QueryLimitError(`offset + limit must not exceed ${MAX_OFFSET}`);
    }
    const filters: ObjectFilter[] = [];
    if (f.authorUserId !== undefined) {
      filters.push({ kind: 'valueEquals', path: 'userId', value: assertSafeId(f.authorUserId) });
    }
    if (f.createdBefore) {
      filters.push({ kind: 'time', field: 'createdAt', op: '<', iso: f.createdBefore });
    }
    if (f.createdAfter) {
      filters.push({ kind: 'time', field: 'createdAt', op: '>', iso: f.createdAfter });
    }
    const page = await this.deps.gw.query(this.deps.c.feedback(), {
      filters,
      sort: { field: 'createdAt', dir: 'desc' },
      limit,
      offset,
      withTotal: true,
    });
    const items = page.results
      .map((r) => feedbackFromValue(r.value))
      .filter((r): r is FeedbackRecord => r !== null)
      .map(feedbackListItem);
    return { items, total: page.total ?? items.length };
  }

  async get(id: string): Promise<FeedbackWithSnapshot | null> {
    const parts = await this.getParts(id);
    if (!parts) return null;
    return { ...parts.record, messages: reassembleSnapshot(parts.chunks) };
  }

  async getParts(id: string): Promise<FeedbackParts | null> {
    const safe = assertSafeId(id);
    const parent = await this.deps.gw.get(this.deps.c.feedback(), safe);
    const record = parent ? feedbackFromValue(parent.value) : null;
    if (!record) return null;
    const container = this.deps.c.feedbackSnap(safe);
    const chunks: Array<Pick<FeedbackSnapshotChunk, 'index' | 'chunk' | 'payload'>> = [];
    for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE) {
      const page = await this.deps.gw.query(container, {
        sort: { field: 'key', dir: 'asc' },
        limit: PAGE,
        offset,
      });
      for (const r of page.results) {
        if (isRecord(r.value)) {
          chunks.push({
            index: Number(r.value.index),
            chunk: Number(r.value.chunk),
            payload: typeof r.value.payload === 'string' ? r.value.payload : '',
          });
        }
      }
      if (page.results.length < PAGE) break;
    }
    return { record, chunks };
  }

  async delete(id: string): Promise<boolean> {
    const safe = assertSafeId(id);
    const gone = await this.deps.gw.delete(this.deps.c.feedback(), safe);
    const container = this.deps.c.feedbackSnap(safe);
    for (;;) {
      const page = await this.deps.gw.query(container, {
        sort: { field: 'key', dir: 'asc' },
        limit: PAGE,
      });
      if (page.results.length === 0) break;
      await mapBounded(page.results, this.deps.concurrency, (r) =>
        this.deps.gw.delete(container, r.key)
      );
    }
    return gone !== null;
  }
}
