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

/** Idle time after which a keep-alive part is written (design D-H5). */
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
  budget: RequestBudget;
  /** Tools of the turn, only used to attribute a schema failure to a tool by name. */
  allTools: ToolSet;
  /** Called once when the stream has ended. Never throws into the stream. */
  onFinish: (turn: ChatTurnResult) => void;
  sessionId?: string;
  keepAliveMs?: number;
  log?: Pick<Log, 'info' | 'warn'>;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'AbortError' || error.name === 'TimeoutError');

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
  let steps = 0;

  const onChunkError = (error: unknown): string => {
    logUnserializableToolSchemas(allTools, 'orchestrator');
    return describeStreamError('orchestrator stream error', error);
  };

  return createUIMessageStream<ChatUIMessage>({
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

      const openText = new Set<string>();
      const openReasoning = new Set<string>();
      let sawStart = false;
      let terminal = false;
      let noticeWritten = false;

      const writeNotice = (): void => {
        if (noticeWritten) return;
        noticeWritten = true;
        if (!sawStart) {
          write({ type: 'start' });
          sawStart = true;
        }
        for (const id of openText) write({ type: 'text-end', id });
        for (const id of openReasoning) write({ type: 'reasoning-end', id });
        openText.clear();
        openReasoning.clear();
        write({ type: 'text-start', id: 'time-limit' });
        write({ type: 'text-delta', id: 'time-limit', delta: TIME_LIMIT_NOTICE });
        write({ type: 'text-end', id: 'time-limit' });
        write({
          type: TURN_STATUS_PART_TYPE,
          data: { status: 'time-limit' },
        });
      };

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
          switch (chunk.type) {
            case 'start':
              sawStart = true;
              break;
            case 'finish-step':
              steps += 1;
              break;
            case 'text-start':
              openText.add(chunk.id);
              break;
            case 'text-end':
              openText.delete(chunk.id);
              break;
            case 'reasoning-start':
              openReasoning.add(chunk.id);
              break;
            case 'reasoning-end':
              openReasoning.delete(chunk.id);
              break;
            case 'finish':
            case 'abort':
              terminal = true;
              // The notice must come BEFORE the terminal chunk, or the client has already
              // closed the message.
              if (budget.timedOut()) writeNotice();
              break;
            default:
              break;
          }
          write(chunk);
        }
      } catch (error) {
        // An abort (hard deadline or client disconnect) ends the run; anything else is a
        // real failure for the stream's onError.
        if (!(budget.hardSignal.aborted && isAbortError(error))) throw error;
      } finally {
        clearInterval(heartbeat);
        if (budget.timedOut()) {
          writeNotice();
          if (!terminal) write({ type: 'finish' });
        }
      }
    },

    onError: (error) => {
      logger.error('Stream error', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return error instanceof Error ? error.message : 'Unknown error';
    },

    onFinish: ({ messages: turnMessages, isAborted }) => {
      const timeLimit = budget.timedOut();
      try {
        log.info('chat turn finished', {
          sessionId: params.sessionId,
          elapsedMs: Date.now() - budget.startedAt,
          phase: budget.phase(),
          steps,
          timeLimit,
        });
        if (timeLimit) {
          log.warn('chat.time_limit_reached', { sessionId: params.sessionId });
        }
        params.onFinish({ messages: turnMessages, isAborted, timeLimit });
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
  | { type: typeof KEEPALIVE_PART_TYPE; data: Record<string, never>; transient: true }
  | { type: typeof TURN_STATUS_PART_TYPE; data: { status: 'time-limit' } };
