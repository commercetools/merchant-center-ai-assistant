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
        isLoose(e) && e.type === 'text' && typeof e.text === 'string' && e.text !== ''
    )
    .map((e) => e.text)
    .join(' ');

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

  let result = considered.map((msg): SanitizedMessage => {
    const role = (typeof msg.role === 'string' && msg.role ? msg.role : 'user') as MessageRole;

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
  });

  if (filterEmpty) {
    result = result.filter(
      (m) =>
        m.content &&
        m.content !== nonTextPlaceholder &&
        m.content !== '[unknown format]'
    );
  }

  if (maxMessages !== undefined && maxMessages > 0) {
    result = result.slice(-maxMessages);
  }
  return result;
};
