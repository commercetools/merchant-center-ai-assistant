/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { UIMessage } from '@ai-sdk/react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps an answer alive when the connection to the service is cut mid-turn.
 *
 * The Merchant Center gateway ends a response after about 120 s, but the service keeps
 * working and stores the answer. So a failed stream is not a failed turn:
 *
 * 1. Reattach with the AI SDK's `resumeStream()`. The service replays the whole turn and
 *    follows it live. Each reattach can itself be cut after about 120 s, hence several.
 * 2. When there is nothing to reattach to (another service instance, or the turn is too
 *    old) or the reattach cannot connect, poll the stored messages until the answer lands.
 * 3. Give up after the service's own time budget, so the user is told instead of waiting.
 *
 * Nothing here starts a second model run.
 */

/** A turn of 270 s needs two reattaches after the first 120 s; one more is margin. */
export const MAX_RESUMES = 3;
export const RESUME_DELAY_MS = 500;
export const POLL_INTERVAL_MS = 4_000;
/** The service stops a turn after 270 s; this is longer than any turn can run. */
export const MAX_POLLS = 75;

export interface RecoveryTiming {
  maxResumes: number;
  resumeDelayMs: number;
  pollIntervalMs: number;
  maxPolls: number;
}

const DEFAULT_TIMING: RecoveryTiming = {
  maxResumes: MAX_RESUMES,
  resumeDelayMs: RESUME_DELAY_MS,
  pollIntervalMs: POLL_INTERVAL_MS,
  maxPolls: MAX_POLLS,
};

/** The schedule the app runs with, with any overrides (the tests') applied. */
export const resolveTiming = (
  overrides?: Partial<RecoveryTiming>
): RecoveryTiming => ({ ...DEFAULT_TIMING, ...overrides });

/** What the client knew when the connection dropped. */
export interface DropSnapshot {
  /** Id of the assistant message that was being streamed (the stored one has the same id). */
  assistantId?: string;
  /** Ids of every message the client already had. */
  knownIds: Set<string>;
}

export interface StreamRecoveryDeps {
  sessionId: string;
  /** `useChat().resumeStream`. */
  resumeStream: () => Promise<void>;
  getMessages: (
    sessionId: string
  ) => Promise<{ success: boolean; data: UIMessage[] }>;
  /**
   * Stops the model run on the service (the user pressed stop). `messageId` names the turn
   * the user was looking at, so a stop that arrives late cannot end a newer turn.
   */
  cancelTurn: (sessionId: string, messageId?: string) => Promise<unknown>;
  /** Puts the stored answer in place of the partial one. */
  applyStored: (stored: UIMessage) => void;
  /**
   * The answer was recovered from storage: refresh whatever follows a finished turn.
   * `droppedAt` is when the connection was lost, which is before the turn ended, so a digest
   * written for this turn is newer than it.
   */
  onRecovered: (droppedAt: number) => void;
  /** Nothing could be recovered. */
  onGiveUp: () => void;
  /** Overrides of the constants above; the tests use it to run in milliseconds. */
  timing?: Partial<RecoveryTiming>;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const snapshotOf = (messages: UIMessage[]): DropSnapshot => {
  const last = messages[messages.length - 1];
  return {
    assistantId: last?.role === 'assistant' ? last.id : undefined,
    knownIds: new Set(messages.map((message) => message.id)),
  };
};

export interface FinishInfo {
  message: UIMessage;
  isError: boolean;
  isAbort: boolean;
  isDisconnect: boolean;
  /** What `onError` reported for this request. */
  error?: Error;
  /** A recovery is running, so this request is one of its reattaches. */
  recovering?: boolean;
}

/**
 * True when the connection broke after the answer had started, which is not a failed turn
 * (see above). A failure before any part arrived, an abort by the user and an error the
 * service reported itself (a well-formed error chunk) are not drops: those keep their own
 * handling, including the retry.
 *
 * The SDK flags a `TypeError` that mentions "fetch" or "network" as a disconnect, which is
 * how Chrome ("network error") and Firefox word a response that was cut. Safari says "Load
 * failed", hence the `TypeError` test next to `isDisconnect`.
 *
 * A reattach builds a fresh message, so "the answer had started" cannot be read from its
 * parts: a reattach that is cut before its first part is still a drop. While a recovery
 * runs that is what `recovering` says.
 */
export const isConnectionDrop = ({
  message,
  isError,
  isAbort,
  isDisconnect,
  error,
  recovering,
}: FinishInfo): boolean =>
  isError &&
  !isAbort &&
  (isDisconnect || error instanceof TypeError) &&
  (message.parts.length > 0 || recovering === true);

/**
 * Whether two transcripts belong to one chat: they start with the same message. `useChat`
 * hands a late `onFinish` of a chat the user already left to the callbacks of the chat on
 * screen, with the left chat's messages; a recovery for those would run in the wrong chat.
 */
export const sameConversation = (a: UIMessage[], b: UIMessage[]): boolean =>
  a[0] !== undefined && a[0].id === b[0]?.id;

/**
 * The stored answer that belongs to the dropped turn, if it has been stored by now.
 *
 * The answer being streamed has an id, and the stored message has the same one, so that is
 * the only match: any other stored answer is an earlier one. After Try again, for instance,
 * the client no longer shows the answer it replaced, but the service still stores it, and
 * taking it for the new turn would end the recovery early with the wrong answer.
 *
 * Without an id (nothing of the answer had reached the client) the match is any stored
 * answer the client has not seen.
 */
export const findStoredAnswer = (
  stored: UIMessage[],
  snapshot: DropSnapshot
): UIMessage | undefined =>
  [...stored]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        (snapshot.assistantId !== undefined
          ? message.id === snapshot.assistantId
          : !snapshot.knownIds.has(message.id))
    );

export const useStreamRecovery = (deps: StreamRecoveryDeps) => {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const timing = resolveTiming(deps.timing);
  const timingRef = useRef(timing);
  timingRef.current = timing;

  const [isRecovering, setIsRecovering] = useState(false);
  // The same fact as `isRecovering`, readable inside callbacks that were created earlier.
  const activeRef = useRef(false);
  // When the connection was first lost in the running recovery.
  const droppedAtRef = useRef(0);
  const mountedRef = useRef(true);
  // Bumped to cancel every loop in flight (new message, stop, other session, unmount).
  const generationRef = useRef(0);
  const resumesRef = useRef(0);
  // Counts `onFinish` calls, so a reattach that ended without one is told apart from one
  // that ended (normally or with another drop) and was handled there.
  const finishesRef = useRef(0);

  /** Ends the recovery state; the loops are ended separately, through the generation. */
  const end = useCallback(() => {
    activeRef.current = false;
    resumesRef.current = 0;
    setIsRecovering(false);
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    end();
  }, [end]);

  useEffect(() => reset, [reset, deps.sessionId]);

  // A late `onFinish` can still reach an unmounted chat (its request is never aborted); it
  // must not start a recovery nothing can cancel.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const poll = useCallback(
    async (generation: number, snapshot: DropSnapshot) => {
      for (
        let attempt = 0;
        attempt < timingRef.current.maxPolls;
        attempt += 1
      ) {
        await sleep(timingRef.current.pollIntervalMs);
        if (generation !== generationRef.current) return;
        try {
          const { data } = await depsRef.current.getMessages(
            depsRef.current.sessionId
          );
          if (generation !== generationRef.current) return;
          const stored = findStoredAnswer(data ?? [], snapshot);
          if (stored) {
            depsRef.current.applyStored(stored);
            end();
            depsRef.current.onRecovered(droppedAtRef.current);
            return;
          }
        } catch {
          // A failed read is not the end of the turn: try again on the next tick.
        }
      }
      if (generation !== generationRef.current) return;
      end();
      depsRef.current.onGiveUp();
    },
    [end]
  );

  /** The stream failed after the answer had started: reattach, or wait for the stored one. */
  const handleDrop = useCallback(
    (snapshot: DropSnapshot) => {
      if (!mountedRef.current) return;
      const generation = generationRef.current;
      if (!activeRef.current) droppedAtRef.current = Date.now();
      activeRef.current = true;
      setIsRecovering(true);
      if (resumesRef.current >= timingRef.current.maxResumes) {
        void poll(generation, snapshot);
        return;
      }
      resumesRef.current += 1;
      void (async () => {
        await sleep(timingRef.current.resumeDelayMs);
        if (generation !== generationRef.current) return;
        const finishesBefore = finishesRef.current;
        try {
          await depsRef.current.resumeStream();
        } catch {
          // Reported through the chat's own onError; the fallback below takes over.
        }
        if (generation !== generationRef.current) return;
        // `onFinish` ran: the reattached stream ended, and whatever followed was handled.
        if (finishesRef.current !== finishesBefore) return;
        // No `onFinish`: a 204 (nothing to reattach to) or a failed connect.
        await poll(generation, snapshot);
      })();
    },
    [poll]
  );

  /** Call at the top of the chat's `onFinish`. */
  const noteFinish = useCallback(() => {
    finishesRef.current += 1;
  }, []);

  /**
   * A stream ended without a drop: any recovery that was running is over, including a
   * poll that is still waiting for the stored answer of a turn this stream has replaced.
   */
  const settle = useCallback(() => {
    reset();
  }, [reset]);

  /** The user pressed stop: end every loop and stop the model run on the service. */
  const stop = useCallback(
    (messageId?: string) => {
      reset();
      void depsRef.current
        .cancelTurn(depsRef.current.sessionId, messageId)
        .catch(() => undefined);
    },
    [reset]
  );

  /** True while a recovery is running; readable from callbacks created before it began. */
  const isActive = useCallback(() => activeRef.current, []);

  /** When the connection was first lost in the running recovery. */
  const droppedAt = useCallback(() => droppedAtRef.current, []);

  return {
    isRecovering,
    isActive,
    droppedAt,
    handleDrop,
    noteFinish,
    settle,
    reset,
    stop,
  };
};
