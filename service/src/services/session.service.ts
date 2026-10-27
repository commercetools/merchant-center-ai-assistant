/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import {
  hasFeatureFlagsFilter,
  sessionVisibleFor,
} from '../middleware/feature-flags.middleware';
import type {
  FeatureFlags,
  MessageStore,
  SessionStore,
} from '../persistence';
import { SKIP } from '../persistence';
import type {
  ChatSession,
  CreateSessionRequest,
  DisabledTools,
  RequestFeatureFlags,
  SessionDigest,
  SessionListItem,
  TemporaryTable,
} from '../types/chat.types';
import type { RequestUser } from '../types/request.types';
import { logger } from '../utils/logger.utils';
import { sanitizeUserLabel } from '../utils/user-label';

/** A hook run before a session is deleted (the BigQuery hook drops the session's temp tables). */
export type SessionCleanupHook = (session: ChatSession) => Promise<void>;

const cleanupHooks: SessionCleanupHook[] = [];

/**
 * Registers a hook that runs for every session being deleted. Hooks run before the
 * messages and the session are removed; a failing hook is logged and never blocks deletion.
 */
export const registerSessionCleanupHook = (hook: SessionCleanupHook): void => {
  cleanupHooks.push(hook);
};

/** Test helper: forget every registered hook. */
export const clearSessionCleanupHooksForTests = (): void => {
  cleanupHooks.length = 0;
};

/** Sessions per user returned by one list call (the store's page size). */
export const LIST_CAP = 500;
const FALLBACK_TITLE_CHARS = 50;

const asStoreFlags = (flags: RequestFeatureFlags | undefined): FeatureFlags | undefined =>
  hasFeatureFlagsFilter(flags) ? (flags as FeatureFlags) : undefined;

export class SessionService {
  constructor(
    private readonly sessions: SessionStore,
    private readonly messages: MessageStore
  ) {}

  async create(user: RequestUser, req: CreateSessionRequest): Promise<ChatSession> {
    const now = Date.now();
    const userLabel = sanitizeUserLabel(req.userLabel);
    const flags = hasFeatureFlagsFilter(req.featureFlags)
      ? (req.featureFlags as FeatureFlags)
      : undefined;
    const session: ChatSession = {
      id: randomUUID(),
      userId: user.userId,
      ...(userLabel ? { userLabel } : {}),
      createdAt: now,
      updatedAt: now,
      // A neutral placeholder; the digest replaces it when the first turn finishes.
      title: req.title || 'New chat',
      metadata: req.metadata ?? {},
      ...(flags ? { featureFlags: flags } : {}),
      schemaVersion: 1,
    };
    await this.sessions.create(session);
    logger.info(`Created session ${session.id}`);
    return session;
  }

  /** The session when it exists and belongs to the user, otherwise null. */
  async get(id: string, user: RequestUser): Promise<ChatSession | null> {
    const session = await this.sessions.get(id);
    return session && session.userId === user.userId ? session : null;
  }

  /** The user's sessions visible with these flags, newest first (at most `LIST_CAP`). */
  async listRecords(
    user: RequestUser,
    o: { limit?: number; flags?: RequestFeatureFlags } = {}
  ): Promise<ChatSession[]> {
    const limit = Math.min(o.limit ?? LIST_CAP, LIST_CAP);
    const records = await this.sessions.listByUser(user.userId, {
      limit,
      featureFlags: asStoreFlags(o.flags),
    });
    return records
      .filter((s) => s.userId === user.userId && sessionVisibleFor(s, o.flags))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  async lastByFlags(
    user: RequestUser,
    flags: RequestFeatureFlags | undefined
  ): Promise<ChatSession | null> {
    return (await this.listRecords(user, { limit: 1, flags }))[0] ?? null;
  }

  async list(
    user: RequestUser,
    o: { limit?: number; flags?: RequestFeatureFlags } = {}
  ): Promise<SessionListItem[]> {
    const records = await this.listRecords(user, o);
    return Promise.all(records.map((s) => this.toListItem(s)));
  }

  /** One list row; reads a message only for sessions that have no digest yet. */
  private async toListItem(session: ChatSession): Promise<SessionListItem> {
    const base: SessionListItem = {
      id: session.id,
      title: session.title || 'Untitled Chat',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      ...(session.featureFlags ? { featureFlags: session.featureFlags } : {}),
    };
    if (session.digestUpdatedAt) {
      return {
        ...base,
        ...(session.description ? { description: session.description } : {}),
        ...(session.icon ? { icon: session.icon } : {}),
      };
    }
    return { ...base, title: await this.titleFromFirstMessage(session) };
  }

  /** The pre-digest title: first 50 characters of the first stored user text. */
  private async titleFromFirstMessage(session: ChatSession): Promise<string> {
    const fallback = session.title || 'Untitled Chat';
    try {
      const [first] = await this.messages.list(session.id, { limit: 1, order: 'asc' });
      const textPart = first?.parts.find(
        (p): p is { type: 'text'; text: string } =>
          typeof p === 'object' &&
          p !== null &&
          (p as { type?: unknown }).type === 'text' &&
          typeof (p as { text?: unknown }).text === 'string'
      );
      const text = textPart?.text.trim();
      if (!text) return fallback;
      return text.length > FALLBACK_TITLE_CHARS
        ? `${text.substring(0, FALLBACK_TITLE_CHARS)}...`
        : text;
    } catch {
      return fallback;
    }
  }

  /** Only `title` and `metadata` are ever applied; refreshes `updatedAt`. */
  async update(
    id: string,
    user: RequestUser,
    updates: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<ChatSession | null> {
    if (!(await this.get(id, user))) return null;
    return this.sessions.update(id, (cur) => ({
      ...cur,
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.metadata !== undefined ? { metadata: updates.metadata } : {}),
    }));
  }

  /** Writes a turn's digest; returns null (never throws) when the session is gone or foreign. */
  async applySessionDigest(
    sessionId: string,
    userId: string,
    digest: SessionDigest
  ): Promise<ChatSession | null> {
    try {
      const session = await this.sessions.get(sessionId);
      if (!session || session.userId !== userId) return null;
      return await this.sessions.update(sessionId, (cur) => ({
        ...cur,
        title: digest.title,
        description: digest.description,
        icon: digest.icon,
        summary: digest.summary,
        nextPrompts: digest.nextPrompts,
        digestUpdatedAt: Date.now(),
      }));
    } catch (error) {
      logger.error(`Failed to apply digest to session ${sessionId}`, error);
      return null;
    }
  }

  /**
   * Merges the disabled-tools map. `change` receives a copy and returns the new map; it
   * must be pure because a version conflict re-runs it.
   */
  async updateDisabledTools(
    id: string,
    user: RequestUser,
    change: (current: DisabledTools) => DisabledTools
  ): Promise<ChatSession | null> {
    if (!(await this.get(id, user))) return null;
    return this.sessions.update(id, (cur) => {
      const next = change({ ...(cur.disabledTools ?? {}) });
      return { ...cur, disabledTools: Object.keys(next).length > 0 ? next : undefined };
    });
  }

  /**
   * Runs the cleanup hooks (failures logged), then deletes the messages and the session.
   * Returns false when the session does not exist or is not the user's.
   */
  async remove(id: string, user: RequestUser): Promise<boolean> {
    const session = await this.get(id, user);
    if (!session) return false;
    const results = await Promise.allSettled(cleanupHooks.map((hook) => hook(session)));
    results.forEach((r) => {
      if (r.status === 'rejected') {
        logger.error(`Session cleanup hook failed for ${id}`, r.reason);
      }
    });
    await this.messages.deleteAll(id);
    await this.sessions.delete(id);
    logger.info(`Deleted session ${id}`);
    return true;
  }

  async addTemporaryTable(
    sessionId: string,
    user: RequestUser,
    table: TemporaryTable
  ): Promise<TemporaryTable[]> {
    const session = await this.get(sessionId, user);
    if (!session) throw new Error('Session not found');
    const toAdd: TemporaryTable = { ...table, columnNames: table.columnNames || '' };
    const updated = await this.sessions.update(sessionId, (cur) => {
      const existing = cur.temporaryTables ?? [];
      if (existing.some((t) => t.tableRef === toAdd.tableRef)) return SKIP;
      return { ...cur, temporaryTables: [...existing, toAdd] };
    });
    return updated.temporaryTables ?? [];
  }

  async getAllTemporaryTables(
    sessionId: string,
    user: RequestUser
  ): Promise<TemporaryTable[]> {
    const session = await this.get(sessionId, user);
    if (!session) throw new Error('Session not found');
    return session.temporaryTables ?? [];
  }

  /** One sentence per table, shown to the model so a later turn knows the columns. */
  async getTemporaryTableMessages(
    sessionId: string,
    user: RequestUser
  ): Promise<string[]> {
    const tables = await this.getAllTemporaryTables(sessionId, user);
    return tables.map((table) => {
      const columns = table.columnNames ? `, columns: ${table.columnNames}` : '';
      return `BigQuery table created: ${table.tableRef} with tool ${table.toolName}, args: ${table.args}${columns}`;
    });
  }
}
