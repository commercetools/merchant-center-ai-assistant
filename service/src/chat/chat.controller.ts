/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { NextFunction, RequestHandler, Response } from 'express';
import { pipeUIMessageStreamToResponse } from 'ai';
import { runTurnDigest, runTurnDigestBeforeClose } from '../agents/turn-digest';
import { DIGEST_BEFORE_CLOSE_CAP_MS } from '../config/sections/chat';
import { getLoadedSession } from '../middleware/load-session.middleware';
import { getServices } from '../services/registry';
import { registry } from '../tool-sources';
import type { ToolSourceRegistry } from '../tool-sources/registry';
import type { AuthenticatedRequest } from '../types/request.types';
import { fail } from '../utils/api-response';
import { logger } from '../utils/logger.utils';
import { sendSSEError } from '../utils/stream.utils';
import { extractUrlReferences } from '../utils/url-references';
import { createToolContext } from './context';
import { buildCustomViewOrchestrator } from './custom-view-orchestrator';
import { loadHistory } from './history';
import { buildOrchestrator, type BuiltAgent } from './orchestrator';
import { getRequestBudget } from './budget.middleware';
import { processMessagesForStorage } from './storage-filter';
import { createChatStream, type ChatUIMessage } from './stream';
import { turnRegistry, type TurnBuffer } from './turn-buffer';
import { validateChatRequest } from './validate-request';

/** The headers of the SSE response. No `Access-Control-Allow-*`: the service has no CORS. */
export const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // do not let a proxy buffer the stream
} as const;

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Copies every SSE frame of the turn into its replay buffer (see `turn-buffer.ts`).
 *
 * The reader must keep up: the SDK tees the stream, and a branch that is not read grows
 * without bound. It also must never reject, because a rejection inside `consumeSseStream`
 * is an unhandled rejection that takes the process down.
 */
const feedTurnBuffer = async (
  stream: ReadableStream<string>,
  turn: TurnBuffer
): Promise<void> => {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      turn.append(value);
    }
  } catch (error) {
    logger.warn('Replay buffer reader stopped', { reason: messageOf(error, 'unknown') });
  } finally {
    turnRegistry.release(turn);
  }
};

/**
 * `POST /service/ai-chat/:sessionId/message/stream` (row 19 of the REST contract).
 *
 * Order: validate -> session (loaded by `loadSession`, 404 when not the caller's) -> budget
 * (started by `startBudget`) -> fire-and-forget save of the user message -> history window ->
 * tool context -> orchestrator (custom view when the session carries the flag) -> stream.
 * Identity is `req.user` only: nothing in the body or query is trusted for identity.
 */
export interface ChatControllerDeps {
  /** Seam for tests; the default starts the real (detached) digest. */
  runTurnDigest: typeof runTurnDigest;
  /** Seam for tests; used instead of `runTurnDigest` when `CHAT_DIGEST_BEFORE_CLOSE` is on. */
  runTurnDigestBeforeClose?: typeof runTurnDigestBeforeClose;
}

export const createSendAiChatMessage =
  (
    toolRegistry: ToolSourceRegistry,
    deps: ChatControllerDeps = { runTurnDigest, runTurnDigestBeforeClose }
  ): RequestHandler =>
  async (req, res, next) => {
    const { sessionId } = req.params;
    const user = (req as AuthenticatedRequest).user;
    const budget = getRequestBudget(res);
    let turn: TurnBuffer | undefined;

    try {
      const validated = validateChatRequest(req);
      if (!validated.ok) {
        fail(res, 400, validated.error);
        return;
      }

      const session = getLoadedSession(res);
      const services = getServices();
      const incoming = validated.message;

      // Do not block the time to first token on the write.
      void services.messages
        .appendMissing(sessionId, [incoming])
        .catch((error) => logger.error('Failed to save user message', error));

      const history = await loadHistory({
        messages: services.messages,
        sessionId,
        incoming,
      });

      const ctx = await createToolContext({
        user,
        session,
        budget,
        locale: req.query.locale,
        urlReferences: extractUrlReferences(history.storageMessages),
      });

      const built: BuiltAgent = session.featureFlags?.customView
        ? await buildCustomViewOrchestrator(ctx, toolRegistry)
        : await buildOrchestrator(ctx, toolRegistry);

      const stream = createChatStream({
        agent: built.agent,
        messages: history.modelMessages,
        originalMessages: history.storageMessages as unknown as ChatUIMessage[],
        budget,
        allTools: built.allTools,
        sessionId,
        onFinish: ({ messages, timeLimit }) => {
          // Persist what the turn produced; ids that are already stored are skipped.
          // Known and intended (TA-20): when the incoming message is an ASSISTANT message
          // (the browser auto-sent after a client-side tool result) the SDK continues that
          // message under its stored id, so the added parts are not persisted. The product
          // has no client-side tools (change P design D-P5 removed `sendAutomaticallyWhen`),
          // so the case does not occur; re-open this if a browser-answered tool is added.
          void services.messages
            .appendMissing(sessionId, processMessagesForStorage(messages))
            .catch((error) => logger.error('Error storing messages', error));

          // Name, describe and iconify the session and work out what the user may ask next:
          // a second model call that is started here and never awaited, so it delays neither
          // the answer nor the composer.
          const digestParams = {
            sessionId,
            userId: user.userId,
            locale: ctx.locale,
            messages,
          };
          // Fallback (R-G1): a runtime that freezes CPU once the response closed never
          // finishes a detached digest, so wait for it here, at most 3 s. Not when the time
          // budget ran out: there is no time left to wait.
          const before =
            deps.runTurnDigestBeforeClose ?? runTurnDigestBeforeClose;
          if (ctx.config.chat.digestBeforeClose && !timeLimit) {
            return before(digestParams, DIGEST_BEFORE_CLOSE_CAP_MS);
          }
          deps.runTurnDigest(digestParams);
          return undefined;
        },
      });

      // The browser's connection can be cut by the gateway while this turn is still running
      // (about 120 s), so the frames are also kept for a reconnecting `resumeStream()`.
      const replay = turnRegistry.start(sessionId, user.userId, () =>
        budget.cancel()
      );
      turn = replay;

      // MUST be awaited. The promise rejects when a write fails mid-stream (it ends the
      // response and re-throws); left un-awaited that is an unhandled rejection, which takes
      // the whole Node process down.
      await pipeUIMessageStreamToResponse({
        response: res,
        stream,
        status: 200,
        headers: STREAM_HEADERS,
        consumeSseStream: ({ stream: frames }) => {
          void feedTurnBuffer(frames, replay);
        },
      });
      logger.info(`AI chat streaming completed for session ${sessionId}`);
    } catch (error) {
      if (turn) turnRegistry.release(turn);
      logger.error(`Error in AI chat for session ${sessionId}`, {
        reason: messageOf(error, 'unknown'),
      });
      reportFailure(res, next, error);
    } finally {
      budget.dispose();
    }
  };

/**
 * Before the headers: the error middleware answers (persistence errors mapped, everything else
 * a generic 500 that never leaks internals). After streaming started: an in-band error frame
 * followed by [DONE] (the one error shape the client's UI message reader validates).
 */
const reportFailure = (
  res: Response,
  next: NextFunction,
  error: unknown
): void => {
  if (!res.headersSent) {
    next(error);
    return;
  }
  if (!res.writableEnded) {
    sendSSEError(res, messageOf(error, 'Streaming failed'));
  }
};

export const sendAiChatMessage = createSendAiChatMessage(registry);
