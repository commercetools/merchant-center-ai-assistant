/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ChatSession, NextPrompt } from '../types/chat.types';

/**
 * What `GET /service/session/:id/digest` answers with, as a pure function of the session.
 * Never calls a model.
 */
export type SessionDigestView =
  | { pending: true }
  | {
      pending: false;
      digestUpdatedAt: number;
      title?: string;
      description?: string;
      icon?: string;
      nextPrompts: NextPrompt[];
    };

/**
 * `since` is the moment the caller's turn finished; a digest at or before it describes the
 * PREVIOUS turn, so it reports pending. Pass `0` to mean "whatever is stored".
 */
export const toSessionDigestView = (
  session: ChatSession,
  since: number
): SessionDigestView => {
  const digestUpdatedAt = session.digestUpdatedAt ?? 0;
  if (!digestUpdatedAt || digestUpdatedAt <= since) return { pending: true };
  return {
    pending: false,
    digestUpdatedAt,
    title: session.title,
    description: session.description,
    icon: session.icon,
    nextPrompts: session.nextPrompts ?? [],
  };
};
