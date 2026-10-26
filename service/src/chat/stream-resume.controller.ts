/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request, RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../types/request.types';
import { okMessage } from '../utils/api-response';
import { STREAM_HEADERS } from './chat.controller';
import { turnRegistry, type TurnBuffer } from './turn-buffer';

/**
 * Connections one turn follows at once. The gateway ends a browser's response without the
 * service seeing it, so every cut leaves one follower behind until the turn ends, and the
 * browser reattaches up to three times per cut. Beyond this the answer is 204 and the browser
 * reads the stored answer instead.
 */
export const MAX_FOLLOWERS_PER_TURN = 8;

/**
 * The id of the assistant message the browser means (`?messageId=`), when it names one. It
 * comes from the `start` frame the browser received, so it pins a reconnect or a stop to the
 * turn the browser was showing and not to a newer, or an older, turn of the same session.
 */
const wantedMessageId = (req: Request): string | undefined => {
  const { messageId } = req.query;
  return typeof messageId === 'string' && messageId ? messageId : undefined;
};

/**
 * The turn of this session that belongs to the verified caller and, when the browser names
 * one, is the turn it means. A turn whose id is not known yet has only just started: it is
 * the one the browser means.
 */
const ownTurn = (
  sessionId: string,
  userId: string,
  messageId?: string
): TurnBuffer | undefined => {
  const turn = turnRegistry.get(sessionId);
  if (!turn || turn.userId !== userId) return undefined;
  if (
    messageId !== undefined &&
    turn.messageId !== undefined &&
    turn.messageId !== messageId
  ) {
    return undefined;
  }
  return turn;
};

/** What a follower writes to; an Express `Response` is one. */
export interface FollowerSink {
  write(frame: string): boolean;
  end(): unknown;
  destroy(): unknown;
  once(event: 'drain', listener: () => void): unknown;
  readonly destroyed: boolean;
}

/**
 * Sends a turn to one connection: everything so far, then the live frames, then the end.
 * Returns what stops following, or `undefined` when the turn cannot be followed.
 *
 * A frame is written only when the connection has taken the previous ones. A connection that
 * does not read (a browser the gateway cut, or one on a bad network) would otherwise make
 * Node copy every frame into a buffer of its own, up to the whole turn per connection. The
 * frames waiting here are references to the strings the turn already holds, so a stalled
 * follower costs a list of pointers.
 */
export const followTurn = (
  turn: TurnBuffer,
  sink: FollowerSink
): (() => void) | undefined => {
  const waiting: string[] = [];
  let next = 0;
  let blocked = false;
  let ended = false;
  let closed = false;

  const pump = (): void => {
    while (next < waiting.length && !blocked && !sink.destroyed) {
      if (!sink.write(waiting[next++])) {
        blocked = true;
        sink.once('drain', () => {
          blocked = false;
          pump();
        });
      }
    }
    if (next >= waiting.length) {
      waiting.length = 0;
      next = 0;
      if (ended && !closed && !sink.destroyed) {
        closed = true;
        sink.end();
      }
    } else if (next >= 1024) {
      waiting.splice(0, next);
      next = 0;
    }
  };

  if (sink.destroyed) return undefined;
  const stopFollowing = turn.subscribe({
    onFrame: (frame) => {
      waiting.push(frame);
      pump();
    },
    onEnd: (end) => {
      if (end === 'done') {
        ended = true;
        pump();
        return;
      }
      // `aborted`: the buffer was dropped mid-turn. Close the connection abruptly so the
      // client sees a failed stream, not a message that looks complete.
      waiting.length = 0;
      next = 0;
      sink.destroy();
    },
  });
  if (!stopFollowing) sink.destroy();
  return stopFollowing;
};

/**
 * `GET /service/ai-chat/:sessionId/message/stream`: the target of the AI SDK's
 * `resumeStream()`.
 *
 * Replays every frame of the running (or just finished) turn from the first one, then
 * follows the live frames until the turn ends. The client rebuilds the whole assistant
 * message from them, so the replay starts with the original `start` frame and its message
 * id. `204` means there is nothing to reattach to (no turn, a turn of another instance, one
 * that grew too large, one that ended long ago, or a turn other than the one named in
 * `?messageId=`); the client then falls back to the stored answer.
 *
 * Ownership: `loadSession` already answered 404 for a session that is not the caller's, and
 * the buffer carries the user id of its turn, so a replay is never served to anyone else.
 */
export const replayChatStream: RequestHandler = (req, res) => {
  // The browser may give up while the session is still being loaded. Its `close` event has
  // fired by now and will not fire again, so a follower started here would never be released.
  if (res.destroyed || req.destroyed) return;
  const { sessionId } = req.params;
  const user = (req as AuthenticatedRequest).user;
  const turn = ownTurn(sessionId, user.userId, wantedMessageId(req));
  if (
    !turn ||
    turn.isDropped ||
    turn.followerCount >= MAX_FOLLOWERS_PER_TURN
  ) {
    res.status(204).end();
    return;
  }

  // Counted until the connection is gone, a replay of a finished turn included.
  res.once('close', turn.holdFollower());

  res.status(200);
  for (const [name, value] of Object.entries(STREAM_HEADERS)) {
    res.setHeader(name, value);
  }
  res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
  res.flushHeaders();

  const stopFollowing = followTurn(turn, res);
  if (stopFollowing) res.on('close', stopFollowing);
};

/**
 * `DELETE /service/ai-chat/:sessionId/message/stream`: the stop button.
 *
 * Aborting the browser's request is not enough any more. After a reconnect the original
 * request is long gone from the browser, so nothing it can close would reach the model run.
 * Idempotent, and best effort: a turn that is not running (a turn that grew too large to
 * replay counts as running until it ends), is not the caller's, is not the
 * one named in `?messageId=` or runs on another instance is not stopped, and the answer says
 * so.
 */
export const cancelChatStream: RequestHandler = (req, res) => {
  const { sessionId } = req.params;
  const user = (req as AuthenticatedRequest).user;
  const turn = ownTurn(sessionId, user.userId, wantedMessageId(req));
  if (turn && !turn.hasEnded) {
    turn.cancel();
    okMessage(res, 'Stopped');
    return;
  }
  okMessage(res, 'Nothing to stop');
};
