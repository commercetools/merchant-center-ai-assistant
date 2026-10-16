/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request } from 'express';
import { logger } from '../utils/logger.utils';
import type { IncomingMessage } from './history';

export type ValidatedChatRequest =
  { ok: true; message: IncomingMessage } | { ok: false; error: string };

const MAX_MESSAGE_ID_CHARS = 200;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rejectMissingMessage = (req: Request, body: unknown): ValidatedChatRequest => {
  const contentType = req.headers['content-type'];
  const receivedKeys = isObject(body) ? Object.keys(body) : [];
  const looksUnparsed =
    receivedKeys.length === 0 &&
    !/^application\/json$/i.test(
      String(contentType ?? '')
        .split(';')[0]
        .trim()
    );

  logger.warn('Rejected message-less chat request', {
    sessionId: req.params.sessionId,
    contentType: contentType ?? 'none',
    bodyKeys: receivedKeys,
  });

  return {
    ok: false,
    error: looksUnparsed
      ? 'Request body was not parsed as JSON. Expected `Content-Type: application/json`, ' +
        `got "${contentType ?? 'none'}". A duplicated value here usually means the client ` +
        'set Content-Type on top of one the fetch layer already sets.'
      : 'Request body must include a `message`. Received keys: ' +
        `[${receivedKeys.join(', ')}]`,
  };
};

const validMessageId = (id: unknown): id is string =>
  typeof id === 'string' && id !== '' && id.length <= MAX_MESSAGE_ID_CHARS;

const validateMessageShape = (
  message: Record<string, unknown>,
  sessionId: string
): ValidatedChatRequest => {
  if (message.role === 'system') {
    logger.warn('Rejected system-role chat message', { sessionId });
    return {
      ok: false,
      error:
        'System messages are not accepted. Send role "user" - system instructions are configured server-side.',
    };
  }

  if (message.role !== 'user' && message.role !== 'assistant') {
    return { ok: false, error: '`message.role` must be "user".' };
  }
  if (!validMessageId(message.id)) {
    return { ok: false, error: '`message.id` must be a non-empty string.' };
  }
  if (!Array.isArray(message.parts)) {
    return { ok: false, error: '`message.parts` must be an array.' };
  }

  return {
    ok: true,
    message: {
      id: message.id,
      role: message.role,
      parts: message.parts,
    },
  };
};

/**
 * Validates the chat request BEFORE any header is flushed and before the user message is
 * stored (capability chat-stream-endpoint, "Request validation before streaming").
 *
 * A missing `message` has two causes and the error text tells them apart:
 *  - the client sent a body without it (`JSON.stringify` drops the key when the last message
 *    is `undefined`, for example a regenerate with nothing to regenerate);
 *  - body-parser never parsed the body. It only parses `application/json`, so a duplicated
 *    header (`application/json, application/json`) leaves `req.body` an empty object while the
 *    browser's network panel still shows the payload.
 *
 * A `system` role is rejected at the boundary: ai v7 throws `InvalidPromptError` for a
 * system-role entry in `messages`, and without this check one persisted system message would
 * take every later turn of the session down. Identity is never read from the body.
 */
export const validateChatRequest = (req: Request): ValidatedChatRequest => {
  const body: unknown = req.body;
  const message = isObject(body) ? body.message : undefined;

  if (!message) return rejectMissingMessage(req, body);

  if (!isObject(message)) {
    return { ok: false, error: '`message` must be an object.' };
  }

  return validateMessageShape(message, req.params.sessionId);
};
