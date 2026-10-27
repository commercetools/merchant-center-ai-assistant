/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  createUIMessageStream,
  type ModelMessage,
  type ToolLoopAgent,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import type { Log } from '../utils/log.types';
import { logger } from '../utils/logger.utils';
import { describeStreamError } from '../utils/stream.utils';
import { logUnserializableToolSchemas } from '../utils/tool-schema-debug';
import {
  KEEPALIVE_PART_TYPE,
  TIME_LIMIT_NOTICE,
  TURN_STATUS_PART_TYPE,
} from './constants';
import type { RequestBudget } from './request-budget';

/** Idle time after which a keep-alive part is written. */
export const KEEPALIVE_INTERVAL_MS = 20_000;

/** SDK timeouts that apply in addition to the budget (never above the remaining budget). */
export const SDK_TIMEOUTS = {
  stepMs: 120_000,
  toolMs: 90_000,
  chunkMs: 60_000,
} as const;

/** The UI message type of the chat stream: custom data parts of this product. */
export type ChatUIMessage = UIMessage<
  unknown,
  {
    keepalive: Record<string, never>;
    'turn-status': { status: 'time-limit' };
  }
>;

export interface ChatTurnResult {
  /** The conversation of the turn as the SDK accumulated it. */
  messages: ChatUIMessage[];
  /** The stream ended by an abort (time limit or client disconnect). */
  isAborted: boolean;
  /** The hard deadline (not a client disconnect) ended the turn and the notice was added. */
  timeLimit: boolean;
}

export interface CreateChatStreamParams {
  agent: ToolLoopAgent<never, ToolSet>;
  messages: ModelMessage[];
  /**
   * The conversation the model was given, in UI shape (history + the new message). Makes
   * `onFinish` receive the WHOLE conversation: persistence skips ids that are already stored
   * and the digest sees the question as well as the answer.
   */
  originalMessages?: ChatUIMessage[];
  budget: RequestBudget;
  /** Tools of the turn, only used to attribute a schema failure to a tool by name. */
  allTools: ToolSet;
  /**
   * Called once when the stream has ended. Never throws into the stream. When it returns a
   * promise the stream close waits for it (keep it short: this is the digest-before-close
   * fallback).
   */
  onFinish: (turn: ChatTurnResult) => void | Promise<void>;
  sessionId?: string;
  keepAliveMs?: number;
  log?: Pick<Log, 'info' | 'warn'>;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'AbortError' || error.name === 'TimeoutError');

interface TurnState {
  steps: number;
  openText: Set<string>;
  openReasoning: Set<string>;
  sawStart: boolean;
  terminal: boolean;
  noticeWritten: boolean;
}

type WriteChunk = (chunk: UIMessageChunk | ChatUIMessageChunk) => void;

const createTurnState = (): TurnState => ({
  steps: 0,
  openText: new Set<string>(),
  openReasoning: new Set<string>(),
  sawStart: false,
  terminal: false,
  noticeWritten: false,
});

const writeNotice = (state: TurnState, write: WriteChunk): void => {
  if (state.noticeWritten) return;
  state.noticeWritten = true;
  if (!state.sawStart) {
    write({ type: 'start' });
    state.sawStart = true;
  }
  for (const id of state.openText) write({ type: 'text-end', id });
  for (const id of state.openReasoning) write({ type: 'reasoning-end', id });
  state.openText.clear();
  state.openReasoning.clear();
  write({ type: 'text-start', id: 'time-limit' });
  write({
    type: 'text-delta',
    id: 'time-limit',
    delta: TIME_LIMIT_NOTICE,
  });
  write({ type: 'text-end', id: 'time-limit' });
  write({
    type: TURN_STATUS_PART_TYPE,
    data: { status: 'time-limit' },
  });
};

/** Updates the turn state from one chunk; `onTerminal` runs for `finish`/`abort`. */
const trackChunk = (
  state: TurnState,
  chunk: UIMessageChunk,
  onTerminal: () => void
): void => {
  switch (chunk.type) {
    case 'start':
      state.sawStart = true;
      break;
    case 'finish-step':
      state.steps += 1;
      break;
    case 'text-start':
      state.openText.add(chunk.id);
      break;
    case 'text-end':
      state.openText.delete(chunk.id);
      break;
    case 'reasoning-start':
      state.openReasoning.add(chunk.id);
      break;
    case 'reasoning-end':
      state.openReasoning.delete(chunk.id);
      break;
    case 'finish':
    case 'abort':
      state.terminal = true;
      onTerminal();
      break;
    default:
      break;
  }
};

/**
 * The UI message stream of one chat turn.
 *
 * - Iterates the agent's UI chunks and writes them itself (instead of fire-and-forget
 *   `writer.merge`), so it can finish the turn gracefully when the time budget ends.
 * - `messageMetadata` attaches `{ usage }` to each `finish-step`.
 * - Every `toUIMessageStream` call has an explicit `onError` (the SDK would mask the real
 *   failure as "An error occurred.") that logs provider details and attributes unserialisable
 *   tool schemas to the tool by name.
 * - When the HARD deadline ends the run, open text parts are closed, the notice text and a
 *   persisted `data-turn-status` part are appended, and the stream ends normally so the
 *   client leaves the `streaming` status. A client disconnect aborts silently.
 * - While idle, a transient `data-keepalive` part is written every 20 s so a proxy does not
 *   cut a silent tool call.
 */
export const createChatStream = (params: CreateChatStreamParams) => {
  const { agent, messages, budget, allTools } = params;
  const keepAliveMs = params.keepAliveMs ?? KEEPALIVE_INTERVAL_MS;
  const log = params.log ?? logger;
  const state = createTurnState();

  const onChunkError = (error: unknown): string => {
    logUnserializableToolSchemas(allTools, 'orchestrator');
    return describeStreamError('orchestrator stream error', error);
  };

  return createUIMessageStream<ChatUIMessage>({
    originalMessages: params.originalMessages,
    execute: async ({ writer }) => {
      let lastWriteAt = Date.now();
      const write = (chunk: UIMessageChunk | ChatUIMessageChunk): void => {
        lastWriteAt = Date.now();
        writer.write(chunk as Parameters<typeof writer.write>[0]);
      };

      const heartbeat = setInterval(() => {
        if (Date.now() - lastWriteAt >= keepAliveMs) {
          write({ type: KEEPALIVE_PART_TYPE, data: {}, transient: true });
        }
      }, keepAliveMs);
      heartbeat.unref();

      try {
        const result = await agent.stream({
          messages,
          abortSignal: budget.hardSignal,
          timeout: SDK_TIMEOUTS,
        });

        for await (const chunk of result.toUIMessageStream({
          onError: onChunkError,
          messageMetadata: ({ part }) =>
            part.type === 'finish-step' ? { usage: part.usage } : undefined,
        })) {
          // The notice must come BEFORE the terminal chunk, or the client has already
          // closed the message.
          trackChunk(state, chunk, () => {
            if (budget.timedOut()) writeNotice(state, write);
          });
          write(chunk);
        }
      } catch (error) {
        // An abort (hard deadline or client disconnect) ends the run; anything else is a
        // real failure for the stream's onError.
        if (!(budget.hardSignal.aborted && isAbortError(error))) throw error;
      } finally {
        clearInterval(heartbeat);
        if (budget.timedOut()) {
          writeNotice(state, write);
          if (!state.terminal) write({ type: 'finish' });
        }
      }
    },

    onError: (error) => {
      logger.error('Stream error', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : 'Unknown error';
    },

    onFinish: async ({ messages: turnMessages, isAborted }) => {
      const timeLimit = budget.timedOut();
      try {
        log.info('chat turn finished', {
          sessionId: params.sessionId,
          elapsedMs: Date.now() - budget.startedAt,
          phase: budget.phase(),
          steps: state.steps,
          timeLimit,
        });
        if (timeLimit) {
          log.warn('chat.time_limit_reached', { sessionId: params.sessionId });
        }
        await params.onFinish({ messages: turnMessages, isAborted, timeLimit });
      } catch (error) {
        logger.error('chat turn completion failed', {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
};

/** Custom data chunks this stream writes itself. */
type ChatUIMessageChunk =
  | {
      type: typeof KEEPALIVE_PART_TYPE;
      data: Record<string, never>;
      transient: true;
    }
  | { type: typeof TURN_STATUS_PART_TYPE; data: { status: 'time-limit' } };
