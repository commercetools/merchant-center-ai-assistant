/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getServices } from '../services/registry';
import type { SessionDigest } from '../types/chat.types';
import { logger } from '../utils/logger.utils';
import { generateSessionDigest } from './session-digest.agent';

export type RunTurnDigestParams = {
  sessionId: string;
  /** Verified owner of the session. */
  userId: string;
  locale?: string;
  /** The finished turn: stored history plus the messages this turn produced. */
  messages: unknown[];
};

/** Seams for tests. */
export type TurnDigestDeps = {
  generate: (p: {
    messages: unknown[];
    locale?: string;
  }) => Promise<SessionDigest | null>;
  apply: (
    sessionId: string,
    userId: string,
    digest: SessionDigest
  ) => Promise<unknown>;
};

const defaultDeps: TurnDigestDeps = {
  generate: generateSessionDigest,
  apply: (sessionId, userId, digest) =>
    getServices().sessions.applySessionDigest(sessionId, userId, digest),
};

/**
 * Did this turn produce an answer? A turn that errored or was cut off mid tool call leaves
 * an assistant message without text; digesting it would rename the session after a question
 * that was never answered. Never throws: it runs on the response path.
 */
export const producedAnswer = (messages: unknown[]): boolean =>
  (Array.isArray(messages) ? messages : []).some((message) => {
    if (!message || typeof message !== 'object') return false;
    const entry = message as {
      role?: unknown;
      parts?: Array<{ type?: unknown; text?: unknown } | null>;
    };
    if (entry.role !== 'assistant' || !Array.isArray(entry.parts)) return false;
    return entry.parts.some(
      (part) =>
        part?.type === 'text' &&
        typeof part.text === 'string' &&
        part.text.trim() !== ''
    );
  });

/**
 * Summarises a finished turn and writes the result onto the session.
 *
 * Deliberately NOT awaited and NOT on the response path: it is a second model call and is
 * started from the chat stream's `onFinish` after the answer has streamed. Returns `void`
 * synchronously; the detached promise catches and logs every rejection. A failed digest
 * leaves the session as it was and the next turn tries again.
 */
export const runTurnDigest = (
  params: RunTurnDigestParams,
  deps: TurnDigestDeps = defaultDeps
): void => {
  startTurnDigest(params, deps);
};

/**
 * Starts the digest and returns its promise (`undefined` when the turn produced no answer).
 * The promise never rejects: every failure is logged inside.
 */
const startTurnDigest = (
  { sessionId, userId, locale, messages }: RunTurnDigestParams,
  deps: TurnDigestDeps
): Promise<void> | undefined => {
  if (!producedAnswer(messages)) {
    logger.info(
      `Skipping digest for session ${sessionId}: the turn produced no answer`
    );
    return undefined;
  }

  return (async () => {
    try {
      const digest = await deps.generate({ messages, locale });
      if (!digest) {
        logger.info(`No digest generated for session ${sessionId}`);
        return;
      }
      await deps.apply(sessionId, userId, digest);
      logger.info(
        `Session ${sessionId} digest updated (${digest.nextPrompts.length} follow-ups)`
      );
    } catch (error) {
      logger.error(`Turn digest failed for session ${sessionId}`, error);
    }
  })();
};

/**
 * Fallback for a runtime that freezes CPU after the response closed: the same
 * digest, but the returned promise resolves when it is done OR after `capMs`, whichever
 * comes first, so the stream close waits at most `capMs`. The digest is NOT cancelled at the
 * cap: it keeps running and applies its result if the process is still alive. Never rejects.
 */
export const runTurnDigestBeforeClose = async (
  params: RunTurnDigestParams,
  capMs: number,
  deps: TurnDigestDeps = defaultDeps
): Promise<void> => {
  const work = startTurnDigest(params, deps);
  if (!work) return;
  let timer: NodeJS.Timeout | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      logger.warn(
        `Digest of session ${params.sessionId} still running after ${capMs} ms; closing the stream without it`
      );
      resolve();
    }, capMs);
    timer.unref();
  });
  try {
    await Promise.race([work, cap]);
  } finally {
    clearTimeout(timer);
  }
};
