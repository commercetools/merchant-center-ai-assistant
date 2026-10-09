/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { mapBounded } from '../persistence/gateway/concurrency';
import { InvalidIdError } from '../persistence/gateway/errors';
import type { MessageStore } from '../persistence/stores/message.store';
import type { SessionStore } from '../persistence/stores/session.store';
import type { SessionRecord } from '../persistence/types/session';
import type { RequestUser } from '../types/request.types';
import type {
  BackofficeFilters,
  BackofficeThread,
  Pagination,
  ServiceResult,
} from '../types/feedback.types';
import { auditAdminAction } from '../utils/audit';

/** Most messages returned per thread. */
export const THREAD_MESSAGE_LIMIT = 2000;
export const MAX_THREAD_PAGE = 25;
const DEFAULT_THREAD_PAGE = 10;
const MAX_OFFSET = 10000;
const MESSAGE_READ_CONCURRENCY = 4;

export interface BackofficeDeps {
  sessions: SessionStore;
  messages: MessageStore;
}

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  Math.min(Math.max(Number.isFinite(value) ? (value as number) : fallback, min), max);

const iso = (ms: number | undefined): string | undefined =>
  ms === undefined || !Number.isFinite(ms) ? undefined : new Date(ms).toISOString();

export class BackofficeService {
  constructor(private readonly deps: BackofficeDeps) {}

  /** The service-computed decision (the verified-user-id allowlist check of change D); nothing from the request is read. */
  isAdmin(user: Pick<RequestUser, 'isAdmin'>): boolean {
    return user.isAdmin;
  }

  private async toThread(
    s: SessionRecord,
    includeMessages: boolean
  ): Promise<BackofficeThread> {
    let messages: BackofficeThread['messages'] = [];
    let truncated = false;
    if (includeMessages) {
      // One more than the cap tells us whether there is more without a second call.
      const stored = await this.deps.messages.list(s.id, {
        order: 'asc',
        limit: THREAD_MESSAGE_LIMIT + 1,
      });
      truncated = stored.length > THREAD_MESSAGE_LIMIT;
      messages = stored.slice(0, THREAD_MESSAGE_LIMIT);
    }
    return {
      sessionId: s.id,
      userId: s.userId,
      ...(s.userLabel ? { userLabel: s.userLabel } : {}),
      ...(s.title ? { title: s.title } : {}),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messages,
      truncated,
    };
  }

  async listThreads(input: {
    user: RequestUser;
    filters?: BackofficeFilters;
    limit?: number;
    offset?: number;
    includeMessages?: boolean;
  }): Promise<{ items: BackofficeThread[]; pagination: Pagination }> {
    const limit = clamp(input.limit, 1, MAX_THREAD_PAGE, DEFAULT_THREAD_PAGE);
    const offset = clamp(input.offset, 0, MAX_OFFSET, 0);
    const includeMessages = input.includeMessages !== false;
    // Only these three filters exist; anything else in the body (a label, an e-mail) is ignored.
    const f = input.filters ?? {};
    const createdBefore = iso(f.createdAtBefore);
    const createdAfter = iso(f.createdAtAfter);

    const page = await this.deps.sessions.listAll({
      limit,
      offset,
      ...(f.userId ? { userId: f.userId } : {}),
      ...(createdBefore ? { createdBefore } : {}),
      ...(createdAfter ? { createdAfter } : {}),
    });
    const items = await mapBounded(
      page.items,
      MESSAGE_READ_CONCURRENCY,
      (s) => this.toThread(s, includeMessages)
    );

    auditAdminAction({
      userId: input.user.userId,
      action: 'backoffice.threads.listed',
      route: '/service/backoffice/threads',
      outcome: 'ok',
      filterUserId: f.userId,
      createdAtBefore: f.createdAtBefore,
      createdAtAfter: f.createdAtAfter,
      count: items.length,
    });

    return {
      items,
      pagination: { limit, offset, total: Math.min(page.total, MAX_OFFSET) },
    };
  }

  async getThread(input: {
    user: RequestUser;
    sessionId: string;
  }): Promise<ServiceResult<BackofficeThread>> {
    let session: SessionRecord | null;
    try {
      session = await this.deps.sessions.get(input.sessionId);
    } catch (error) {
      if (error instanceof InvalidIdError) {
        return { status: 404, error: 'Thread not found' };
      }
      throw error;
    }
    if (!session) return { status: 404, error: 'Thread not found' };
    const thread = await this.toThread(session, true);

    auditAdminAction({
      userId: input.user.userId,
      action: 'backoffice.thread.read',
      route: '/service/backoffice/threads/:sessionId',
      outcome: 'ok',
      sessionId: session.id,
      sessionUserId: session.userId,
    });

    return { status: 200, data: thread };
  }
}
