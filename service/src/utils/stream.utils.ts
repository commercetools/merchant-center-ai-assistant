/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Response } from 'express';
import { logger } from './logger.utils';

/**
 * Report a failure on an AI SDK UI message stream and close it.
 *
 * The frame has to be `{ type: 'error', errorText }` followed by `[DONE]`, because that is
 * the one error shape `readUIMessageStream` on the client validates against. Any other
 * envelope fails the client's discriminated union and surfaces as a ~200-line Zod error
 * with the real server message buried in it.
 */
export function sendSSEError(res: Response, error: string | Error): void {
  const errorText = error instanceof Error ? error.message : error;
  try {
    res.write(`data: ${JSON.stringify({ type: 'error', errorText })}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (writeError) {
    logger.error('Error sending SSE error frame', writeError);
  }
  res.end();
}

type StreamErrorLike = {
  name?: string;
  message?: string;
  cause?: unknown;
  statusCode?: number;
  responseBody?: unknown;
  url?: string;
  data?: unknown;
};

/**
 * Extract a loggable description of an AI SDK streaming error and return the readable
 * message for the client.
 *
 * `toUIMessageStream()` defaults `onError` to `() => 'An error occurred.'`, which also hides
 * the cause from our own logs. Provider failures carry the useful detail on
 * `cause`/`responseBody`/`statusCode` rather than in `message`, so those are pulled out
 * explicitly (`responseBody` truncated to 2000 characters).
 */
export function describeStreamError(context: string, error: unknown): string {
  const err: StreamErrorLike =
    typeof error === 'object' && error !== null
      ? (error as StreamErrorLike)
      : {};

  const detail: Record<string, unknown> = {};
  if (err.name) detail.name = err.name;
  if (err.statusCode !== undefined) detail.statusCode = err.statusCode;
  if (err.url) detail.url = err.url;
  if (err.responseBody)
    detail.responseBody = String(err.responseBody).slice(0, 2000);
  if (err.data !== undefined) detail.data = err.data;
  if (err.cause) {
    detail.cause =
      err.cause instanceof Error
        ? { name: err.cause.name, message: err.cause.message }
        : err.cause;
  }

  logger.error(context, {
    errorMessage: error instanceof Error ? error.message : String(error),
    ...detail,
  });

  return error instanceof Error ? error.message : 'Unknown error';
}
