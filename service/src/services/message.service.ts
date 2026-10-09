/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { MessageStore, SessionStore } from '../persistence';
import type { AiSdkChatMessage } from '../types/chat.types';

type IncomingMessage = Pick<
  AiSdkChatMessage,
  'id' | 'role' | 'parts' | 'metadata'
> & {
  timestamp?: number;
};

export class MessageService {
  constructor(
    private readonly messages: MessageStore,
    private readonly sessions: SessionStore
  ) {}

  /**
   * Stores only the messages whose id is not stored yet (idempotent: the stream route saves
   * the user message and `onFinish` sends it again) and bumps the session's `updatedAt`.
   * Returns what was newly stored.
   */
  async appendMissing(
    sessionId: string,
    incoming: IncomingMessage[]
  ): Promise<AiSdkChatMessage[]> {
    const unique = [...new Map(incoming.map((m) => [m.id, m])).values()];
    if (unique.length === 0) return [];
    const known = await this.messages.has(
      sessionId,
      unique.map((m) => m.id)
    );
    const missing = unique.filter((m) => !known.has(m.id));
    if (missing.length === 0) return [];
    const stored = await this.messages.put(
      sessionId,
      missing.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        ...(m.metadata ? { metadata: m.metadata } : {}),
        timestamp: Date.now(),
      }))
    );
    await this.sessions.touch(sessionId);
    return stored;
  }

  /** Oldest first; `offset` skips from the oldest end. */
  async list(
    sessionId: string,
    o: { limit?: number; offset?: number } = {}
  ): Promise<AiSdkChatMessage[]> {
    const offset = o.offset ?? 0;
    const wanted = o.limit === undefined ? undefined : o.limit + offset;
    const rows = await this.messages.list(sessionId, {
      limit: wanted,
      order: 'asc',
    });
    return rows.slice(offset);
  }

  /** The newest `n` messages in chronological order (history for the model). */
  async lastN(sessionId: string, n: number): Promise<AiSdkChatMessage[]> {
    return this.messages.list(sessionId, { limit: n, order: 'desc' });
  }
}
