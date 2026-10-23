/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatServiceConnector } from './use-chat-service-connector/use-chat-service-connector';
import type { NextPrompt } from './use-chat-service-connector/types';

/**
 * When to look for a digest after a turn finishes, in milliseconds from the moment it did.
 *
 * Front-loaded and short: the digest is one flash-lite call over twenty messages, so it
 * usually lands inside two seconds. Giving up after roughly eight is deliberate - if it
 * has not arrived by then something is wrong upstream, and the chips are an enhancement
 * nobody is waiting for. Four requests is the whole cost.
 */
const POLL_SCHEDULE_MS = [900, 1800, 2500, 3000];

type Result = {
  prompts: NextPrompt[];
  /** Clears the chips - called when the user types or sends, so they cannot go stale. */
  dismiss: () => void;
};

/**
 * The follow-up chips under the last reply.
 *
 * Two sources, because there are two ways to arrive at a conversation:
 *
 *  - Opening an existing chat: the prompts are already on the session document, so they
 *    are read once, immediately.
 *  - Finishing a turn: the service digests it AFTER the stream closes, so there is nothing
 *    to read at the moment the turn ends. This polls for a digest newer than that moment.
 *
 * Polling rather than receiving them in the stream is the point of the whole design. The
 * service could write them as a `data-` part, but the stream would have to stay open until
 * the digest finished, and `useChat` reports an open stream as `streaming` - which would
 * lock the composer for those seconds. An answer the user can act on immediately matters
 * more than chips that arrive with it.
 */
export const useNextPrompts = (
  sessionId: string | null,
  /** Bumped when a turn finishes successfully; also the `since` the poll uses. */
  turnFinishedAt: number | null
): Result => {
  const { getSessionDigest } = useChatServiceConnector();
  const [prompts, setPrompts] = useState<NextPrompt[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setPrompts([]);
  }, [clearTimers]);

  // A different conversation has different follow-ups. Nothing here is keyed on
  // `sessionId`, so without this the previous chat's chips would linger under the new one.
  useEffect(() => {
    clearTimers();
    setPrompts([]);
  }, [sessionId, clearTimers]);

  // Opening an existing conversation: whatever the last turn produced is already stored.
  useEffect(() => {
    if (!sessionId || turnFinishedAt) return;

    let cancelled = false;
    getSessionDigest(sessionId, 0)
      .then((response) => {
        if (cancelled || !response?.success || response.data.pending) return;
        setPrompts(response.data.nextPrompts ?? []);
      })
      .catch(() => {
        // Chips are an enhancement; a failed read is not worth surfacing.
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, turnFinishedAt, getSessionDigest]);

  // A turn just finished: wait for the digest that describes it.
  useEffect(() => {
    if (!sessionId || !turnFinishedAt) return;

    let cancelled = false;
    clearTimers();
    setPrompts([]);

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await getSessionDigest(sessionId, turnFinishedAt);
        if (cancelled || !response?.success || response.data.pending) return;

        setPrompts(response.data.nextPrompts ?? []);
        // Arrived: cancel the attempts still queued behind this one.
        clearTimers();
      } catch {
        // Ignore and let the next scheduled attempt try again.
      }
    };

    timers.current = POLL_SCHEDULE_MS.map((delay) => setTimeout(poll, delay));

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [sessionId, turnFinishedAt, getSessionDigest, clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return { prompts, dismiss };
};
