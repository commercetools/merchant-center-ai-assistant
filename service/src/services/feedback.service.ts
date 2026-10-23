/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import { isOwner } from '../auth/ownership';
import CustomError from '../errors/custom.error';
import { InvalidIdError, PersistenceError } from '../persistence/gateway/errors';
import type { FeedbackStore } from '../persistence/stores/feedback.store';
import type { MessageStore } from '../persistence/stores/message.store';
import type { SessionStore } from '../persistence/stores/session.store';
import type { SettingsStore } from '../persistence/stores/settings.store';
import type {
  FeedbackSnapshotChunk,
  FeedbackTruncation,
  SnapshotMessage,
} from '../persistence/types/feedback';
import type { RequestUser } from '../types/request.types';
import type {
  FeedbackDetail,
  FeedbackListItem,
  FeedbackListQuery,
  FeedbackRecord,
  FeedbackSubmitBody,
  FeedbackSubmitResult,
  Pagination,
  ServiceResult,
} from '../types/feedback.types';
import { auditAdminAction, auditSubmission } from '../utils/audit';
import {
  buildSnapshot,
  byteLength,
  fitNewest,
  MAX_COMMENT_LENGTH,
  MAX_SNAPSHOT_BYTES,
  MAX_SYSTEM_PROMPT_BYTES,
  reassemble,
  snapshotChunkKey,
  stripInlineDataUrls,
  truncateToBytes,
} from '../utils/feedback-snapshot';
import { logger } from '../utils/logger.utils';
import { sanitizeUserLabel } from '../utils/user-label';

/** `messageIndex` of a truncation that is not about one message. */
const NOT_A_MESSAGE = -1;
/** Longest stored transcript read for a server-sourced snapshot. */
const SERVER_MESSAGE_LIMIT = 2000;
/** The platform's maximum offset; `total` is reported up to this value. */
export const MAX_TOTAL = 10000;

export interface FeedbackDeps {
  sessions: SessionStore;
  messages: MessageStore;
  feedback: FeedbackStore;
  settings: SettingsStore;
  now?: () => number;
  newId?: () => string;
}

const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
  Math.min(Math.max(Number.isFinite(value) ? (value as number) : fallback, min), max);

/** Cut to `max` UTF-16 units without leaving half of a surrogate pair. */
const cutText = (value: string, max: number): string => {
  if (value.length <= max) return value;
  const code = value.charCodeAt(max - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
  return value.slice(0, end);
};

const iso = (ms: number | undefined): string | undefined =>
  ms === undefined || !Number.isFinite(ms) ? undefined : new Date(ms).toISOString();

type SnapshotResult = ReturnType<typeof buildSnapshot>;
type OwnedSession = NonNullable<Awaited<ReturnType<SessionStore['get']>>>;

const limitComment = (comment: string, truncations: FeedbackTruncation[]): string => {
  if (comment.length <= MAX_COMMENT_LENGTH) return comment;
  truncations.push({
    messageIndex: NOT_A_MESSAGE,
    path: 'comment',
    reason: 'comment',
    originalBytes: byteLength(comment),
  });
  return cutText(comment, MAX_COMMENT_LENGTH);
};

async function findAccessibleSession(
  sessions: SessionStore,
  sessionId: string,
  user: RequestUser
): Promise<OwnedSession | undefined> {
  let session;
  try {
    session = await sessions.get(sessionId);
  } catch (error) {
    // An id the store refuses to key on cannot name a session.
    if (error instanceof InvalidIdError) return undefined;
    throw error;
  }
  if (!session || !(isOwner(session, user) || user.isAdmin)) return undefined;
  return session;
}

async function clientSnapshotSource(
  messages: MessageStore,
  sessionId: string,
  clientMessages: SnapshotMessage[]
): Promise<{ source: SnapshotMessage[]; storedMessageCount: number }> {
  let storedMessageCount = 0;
  try {
    storedMessageCount = await messages.count(sessionId);
  } catch (error) {
    logger.warn(
      `Failed to count stored messages for session ${sessionId}; recording 0 (${
        (error as Error).name
      })`
    );
  }
  if (storedMessageCount > clientMessages.length) {
    logger.warn(
      `Feedback snapshot for session ${sessionId} is shorter than storage: client sent ${clientMessages.length} message(s), server holds ${storedMessageCount}`
    );
  }
  return { source: clientMessages, storedMessageCount };
}

async function serverSnapshotSource(
  messages: MessageStore,
  sessionId: string
): Promise<{ source: SnapshotMessage[]; storedMessageCount: number }> {
  // Newest 2000: `list` always answers chronologically, `desc` + limit picks the tail.
  const stored = await messages.list(sessionId, {
    order: 'desc',
    limit: SERVER_MESSAGE_LIMIT,
  });
  const source = stored.map((m): SnapshotMessage => ({ ...m }));
  return { source, storedMessageCount: source.length };
}

function fitSnapshotToLimit(
  stripped: SnapshotMessage[],
  snapshotSource: 'client' | 'server',
  sessionId: string,
  truncations: FeedbackTruncation[]
): { snapshot: SnapshotResult } | { rejection: ServiceResult<FeedbackSubmitResult> } {
  const snapshot = buildSnapshot(stripped);
  if (snapshot.snapshotBytes <= MAX_SNAPSHOT_BYTES) return { snapshot };
  if (snapshotSource === 'client') {
    logger.warn(
      `Feedback snapshot for session ${sessionId} rejected: ${snapshot.snapshotBytes} bytes exceeds the ${MAX_SNAPSHOT_BYTES} byte limit`
    );
    return {
      rejection: {
        status: 413,
        error: 'Feedback snapshot is too large',
        message: `Snapshot is ${snapshot.snapshotBytes} bytes, the limit is ${MAX_SNAPSHOT_BYTES} bytes. Submit without the transcript to store the saved conversation instead.`,
      },
    };
  }
  const fitted = fitNewest(stripped, MAX_SNAPSHOT_BYTES);
  truncations.push({
    messageIndex: NOT_A_MESSAGE,
    path: 'messages',
    reason: 'snapshot-tail',
    originalBytes: snapshot.snapshotBytes,
  });
  logger.warn(
    `Feedback snapshot for session ${sessionId} kept the newest ${fitted.messages.length} message(s), dropped ${fitted.droppedCount}`
  );
  return { snapshot: buildSnapshot(fitted.messages) };
}

async function captureSystemPrompt(
  settings: SettingsStore,
  truncations: FeedbackTruncation[]
): Promise<string | undefined> {
  try {
    const raw = (await settings.get()).systemPrompt;
    if (!raw) return undefined;
    const systemPrompt = truncateToBytes(raw, MAX_SYSTEM_PROMPT_BYTES);
    if (systemPrompt !== raw) {
      truncations.push({
        messageIndex: NOT_A_MESSAGE,
        path: 'systemPrompt',
        reason: 'system-prompt',
        originalBytes: byteLength(raw),
      });
    }
    return systemPrompt;
  } catch (error) {
    logger.warn(`Feedback: system prompt unavailable (${(error as Error).name})`);
    return undefined;
  }
}

async function writeFeedback(
  feedback: FeedbackStore,
  record: FeedbackRecord,
  snapshot: SnapshotResult
): Promise<void> {
  const { id } = record;
  const chunks: FeedbackSnapshotChunk[] = snapshot.payloads.map((payload, ordinal) => ({
    docId: snapshotChunkKey(id, ordinal),
    index: ordinal,
    chunk: 0,
    chunks: snapshot.chunkCount,
    payload,
  }));
  try {
    await feedback.put(record, chunks);
  } catch (error) {
    try {
      await feedback.delete(id);
    } catch (cleanupError) {
      logger.warn(
        `Feedback ${id}: cleanup after a failed write also failed (${
          (cleanupError as Error).name
        })`
      );
    }
    logger.error(`Feedback ${id}: write failed`, error);
    if (error instanceof PersistenceError) throw error;
    throw new CustomError(500, 'Failed to submit feedback');
  }
}

export class FeedbackService {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: FeedbackDeps) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
  }

  async submit(input: {
    user: RequestUser;
    body: FeedbackSubmitBody;
  }): Promise<ServiceResult<FeedbackSubmitResult>> {
    const { user, body } = input;
    const { sessions, messages, feedback, settings } = this.deps;

    // 1. Input. `userLabel` is read from the body only and is display text.
    const sessionIdRaw = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionIdRaw) {
      return {
        status: 400,
        error: 'sessionId is required and must be a non-empty string',
      };
    }
    const sessionId = sessionIdRaw;
    const userLabel = sanitizeUserLabel(body.userLabel);

    // 2. Comment.
    const truncations: FeedbackTruncation[] = [];
    const comment = limitComment(typeof body.comment === 'string' ? body.comment.trim() : '', truncations);

    // 3. Ownership. An unknown id and somebody else's session answer the same 404.
    const session = await findAccessibleSession(sessions, sessionId, user);
    if (!session) return { status: 404, error: 'Session not found' };

    // 4. Snapshot source: the client array or the stored transcript, never a merge.
    const clientMessages: SnapshotMessage[] = Array.isArray(body.messages)
      ? (body.messages as SnapshotMessage[])
      : [];
    const clientMessageCount = clientMessages.length;
    const snapshotSource = clientMessageCount > 0 ? 'client' : 'server';
    const { source, storedMessageCount } =
      snapshotSource === 'client'
        ? await clientSnapshotSource(messages, sessionId, clientMessages)
        : await serverSnapshotSource(messages, sessionId);

    // 5. Strip oversized data URLs, serialise once, apply the 413 policy.
    const stripped = stripInlineDataUrls(source);
    truncations.push(...stripped.truncations);
    const fit = fitSnapshotToLimit(stripped.messages, snapshotSource, sessionId, truncations);
    if ('rejection' in fit) return fit.rejection;
    const { snapshot } = fit;

    // 6. The system prompt in force, capped (best effort: feedback is worth more than it).
    const systemPrompt = await captureSystemPrompt(settings, truncations);

    // 7. The record. Optional members are spread conditionally, never set to undefined.
    const createdAt = this.now();
    const id = this.newId();
    const record: FeedbackRecord = {
      id,
      sessionId,
      userId: user.userId,
      ...(userLabel ? { userLabel } : {}),
      comment,
      createdAt,
      createdAtIso: new Date(createdAt).toISOString(),
      snapshotSource,
      messageCount: snapshot.messageCount,
      chunkCount: snapshot.chunkCount,
      snapshotBytes: snapshot.snapshotBytes,
      snapshotSha256: snapshot.sha256,
      clientMessageCount,
      storedMessageCount,
      truncated: truncations.length > 0,
      ...(session.userId ? { sessionUserId: session.userId } : {}),
      ...(truncations.length > 0 ? { truncations } : {}),
      ...(session.title ? { sessionTitle: session.title } : {}),
      ...(session.createdAt ? { sessionCreatedAt: session.createdAt } : {}),
      ...(session.updatedAt ? { sessionUpdatedAt: session.updatedAt } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(session.disabledTools ? { disabledTools: session.disabledTools } : {}),
      ...(session.temporaryTables ? { temporaryTables: session.temporaryTables } : {}),
      ...(session.featureFlags ? { featureFlags: session.featureFlags } : {}),
      schemaVersion: 1,
    };

    // 8. Chunks first, parent last (the store guarantees the order); clean up on failure.
    await writeFeedback(feedback, record, snapshot);

    // 9. Audit: user ids only.
    auditSubmission({
      userId: user.userId,
      feedbackId: id,
      sessionId,
      sessionUserId: session.userId,
      messageCount: record.messageCount,
      chunkCount: record.chunkCount,
      snapshotBytes: record.snapshotBytes,
      snapshotSource,
    });
    if (session.userId !== user.userId) {
      auditAdminAction({
        userId: user.userId,
        action: 'feedback.submit-on-behalf',
        route: '/service/feedback/submit',
        outcome: 'ok',
        feedbackId: id,
        sessionId,
        sessionUserId: session.userId,
      });
    }

    return {
      status: 201,
      data: {
        id,
        createdAt,
        messageCount: record.messageCount,
        snapshotSource,
        truncated: record.truncated,
        snapshotBytes: record.snapshotBytes,
      },
    };
  }

  async list(input: {
    user: RequestUser;
    limit?: number;
    offset?: number;
    filters?: FeedbackListQuery;
  }): Promise<{ items: FeedbackListItem[]; pagination: Pagination }> {
    const limit = clamp(input.limit, 1, 100, 20);
    const offset = clamp(input.offset, 0, MAX_TOTAL, 0);
    const filters = input.filters ?? {};
    const createdBefore = iso(filters.createdAtBefore);
    const createdAfter = iso(filters.createdAtAfter);
    const page = await this.deps.feedback.list(
      {
        ...(filters.authorUserId ? { authorUserId: filters.authorUserId } : {}),
        ...(createdBefore ? { createdBefore } : {}),
        ...(createdAfter ? { createdAfter } : {}),
      },
      limit,
      offset
    );

    auditAdminAction({
      userId: input.user.userId,
      action: 'feedback.listed',
      route: '/service/feedback/fetch',
      outcome: 'ok',
      authorUserId: filters.authorUserId,
      createdAtBefore: filters.createdAtBefore,
      createdAtAfter: filters.createdAtAfter,
      count: page.items.length,
    });

    return {
      items: page.items,
      pagination: {
        limit,
        offset,
        total: Math.min(page.total, MAX_TOTAL),
      },
    };
  }

  async get(input: {
    user: RequestUser;
    feedbackId: string;
  }): Promise<ServiceResult<FeedbackDetail>> {
    let parts;
    try {
      parts = await this.deps.feedback.getParts(input.feedbackId);
    } catch (error) {
      if (error instanceof InvalidIdError) {
        return { status: 404, error: 'Feedback not found' };
      }
      throw error;
    }
    if (!parts) return { status: 404, error: 'Feedback not found' };

    const { record } = parts;
    const payloads: Array<string | undefined> = Array.from({
      length: record.chunkCount,
    });
    for (const c of parts.chunks) {
      if (Number.isInteger(c.index) && c.index >= 0 && c.index < record.chunkCount) {
        payloads[c.index] = c.payload;
      }
    }
    const { messages, intact } = reassemble({
      payloads,
      expectedChunkCount: record.chunkCount,
      sha256: record.snapshotSha256,
    });

    auditAdminAction({
      userId: input.user.userId,
      action: 'feedback.read',
      route: '/service/feedback/fetch/:feedbackId',
      outcome: 'ok',
      feedbackId: record.id,
      sessionId: record.sessionId,
      sessionUserId: record.sessionUserId,
      messageCount: record.messageCount,
    });

    return { status: 200, data: { ...record, messages, snapshotIntact: intact } };
  }
}
