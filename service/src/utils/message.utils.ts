/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Simplified message format for AI side calls (digest, analyzer). */
export interface SanitizedMessage {
  role: MessageRole;
  content: string;
}

export interface SanitizeMessagesOptions {
  /** Maximum number of messages to return (the last N). No limit if undefined. */
  maxMessages?: number;
  /** Drop messages with no text. Default false. */
  filterEmpty?: boolean;
  /** Placeholder for non-text content. Default `[non-text content]`. */
  nonTextPlaceholder?: string;
  /** Drop `tool` role messages (they cannot be reduced to a string). Default false. */
  excludeToolMessages?: boolean;
}

type Loose = Record<string, unknown>;

const isLoose = (v: unknown): v is Loose =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Joined text of the `{ type: 'text', text }` entries of a parts / content array. */
const textOf = (entries: unknown[]): string =>
  entries
    .filter(
      (e): e is Loose & { text: string } =>
        isLoose(e) &&
        e.type === 'text' &&
        typeof e.text === 'string' &&
        e.text !== ''
    )
    .map((e) => e.text)
    .join(' ');

const sanitizeMessage = (msg: Loose, nonTextPlaceholder: string): SanitizedMessage => {
  const role = (
    typeof msg.role === 'string' && msg.role ? msg.role : 'user'
  ) as MessageRole;

  if (Array.isArray(msg.parts)) {
    return { role, content: textOf(msg.parts) || nonTextPlaceholder };
  }
  if (typeof msg.content === 'string') {
    return { role, content: msg.content };
  }
  if (Array.isArray(msg.content)) {
    return { role, content: textOf(msg.content) || nonTextPlaceholder };
  }
  return { role, content: '[unknown format]' };
};

const hasContent = (m: SanitizedMessage, nonTextPlaceholder: string): boolean =>
  !!m.content && m.content !== nonTextPlaceholder && m.content !== '[unknown format]';

/**
 * Reduces messages in any supported shape (AI SDK UIMessage with `parts`, ModelMessage with
 * string or array `content`) to `{ role, content }`.
 *
 * Needed because tool results can hold non-serialisable values, assistant messages with tool
 * calls have complex content arrays, and UI messages use `parts` instead of `content`.
 */
export const sanitizeMessages = (
  messages: unknown[],
  options: SanitizeMessagesOptions = {}
): SanitizedMessage[] => {
  const {
    maxMessages,
    filterEmpty = false,
    nonTextPlaceholder = '[non-text content]',
    excludeToolMessages = false,
  } = options;

  if (!Array.isArray(messages) || messages.length === 0) return [];

  const objects = messages.filter(isLoose);
  const considered = excludeToolMessages
    ? objects.filter((m) => m.role !== 'tool')
    : objects;

  let result = considered.map((msg) => sanitizeMessage(msg, nonTextPlaceholder));

  if (filterEmpty) {
    result = result.filter((m) => hasContent(m, nonTextPlaceholder));
  }

  if (maxMessages !== undefined && maxMessages > 0) {
    result = result.slice(-maxMessages);
  }
  return result;
};

/**
 * Remove `system`-role messages from a conversation history.
 *
 * ai v7 rejects system-role entries in `messages` outright (`InvalidPromptError: "System
 * messages are not allowed in the prompt or messages fields. Use the instructions option
 * instead."`). A session persisted before that guard existed can still hold one and would fail
 * every turn. The system prompt reaches the model through the agent's `instructions`, never
 * through history, so dropping these is lossless.
 *
 * It does NOT protect against an empty result (ai v7 also rejects empty `messages`): callers
 * must guarantee one non-system message, which the chat endpoint does by rejecting a
 * system-role incoming message at the route boundary.
 */
export const stripSystemMessages = <T extends { role?: string }>(
  messages: T[],
  onDropped?: (count: number) => void
): T[] => {
  const kept = messages.filter((message) => message.role !== 'system');
  const dropped = messages.length - kept.length;
  if (dropped > 0) onDropped?.(dropped);
  return kept;
};

/**
 * Drop trailing messages until the history ends with a user turn.
 *
 * Gemini's `generateContent` refuses a request whose `contents` ends with a model turn
 * (HTTP 400 "Requests ending with a model turn are not supported."), which is easy to produce
 * when the `tool` messages are dropped from an orchestrator history. Trimming rather than
 * appending a filler user turn: a synthetic message would change what the model is asked.
 * Callers must still handle an empty result.
 */
export const endWithUserMessage = <T extends { role?: string }>(
  messages: T[]
): T[] => {
  let end = messages.length;
  while (end > 0 && messages[end - 1].role !== 'user') end -= 1;
  return messages.slice(0, end);
};
