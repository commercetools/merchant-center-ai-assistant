/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { readConfiguration } from '../config';
import CustomError from '../errors/custom.error';
import {
  ConflictError,
  InvalidIdError,
  NotFoundError,
  PersistenceError,
  QueryLimitError,
  SessionTooLongError,
  TooLargeError,
  UnavailableError,
  ValidationError,
} from '../persistence/gateway/errors';
import { logger } from '../utils/logger.utils';
import { requestUrlForLog } from '../utils/log-url.utils';

/**
 * An Express-convention HTTP error: not a `CustomError`, but still carrying its
 * own status. body-parser throws these - an oversized JSON body arrives here as
 * `{ status: 413, type: 'entity.too.large' }`.
 */
type HttpError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

/**
 * The 4xx status this error asked for, or undefined if it did not ask for one
 * (or asked for a 5xx, which the generic branch should keep handling).
 */
const clientErrorStatus = (error: HttpError): number | undefined => {
  const status = error.status ?? error.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
};

/**
 * Persistence errors become fixed, generic HTTP answers. Messages never carry container
 * names, ids or values.
 */
export function mapPersistenceError(error: unknown): CustomError | undefined {
  if (!(error instanceof PersistenceError)) return undefined;
  if (error instanceof NotFoundError || error instanceof InvalidIdError) {
    return new CustomError(404, 'Not found');
  }
  if (error instanceof ConflictError) {
    return new CustomError(409, 'Conflict, please retry');
  }
  if (error instanceof TooLargeError) {
    return new CustomError(413, 'Payload too large');
  }
  if (error instanceof UnavailableError) {
    return new CustomError(503, 'Storage temporarily unavailable, please retry');
  }
  if (error instanceof ValidationError) {
    return new CustomError(400, 'Invalid request');
  }
  if (error instanceof SessionTooLongError) {
    return new CustomError(413, 'Session is too long');
  }
  if (error instanceof QueryLimitError) {
    return new CustomError(400, 'Invalid paging parameters');
  }
  return undefined;
}

export const errorMiddleware: ErrorRequestHandler = (
  rawError: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const mapped = mapPersistenceError(rawError);
  const error: Error = mapped ?? rawError;
  const isDevelopment = readConfiguration().server.nodeEnv === 'development';

  if (error instanceof CustomError) {
    // Without a line the caller sees a 401/403 while the server appears to have
    // said nothing at all.
    logger.warn(
      `${req.method} ${requestUrlForLog(req)} -> ${error.statusCode}: ${error.message}`
    );
    res.status(Number(error.statusCode)).json({
      message: error.message,
      errors: error.errors,
      stack: isDevelopment ? error.stack : undefined,
    });
    return;
  }

  // 4xx passthrough, ahead of the generic branch: without it a real 413 from a
  // body-parser limit surfaces as `500 Internal server error` with no hint
  // about the actual cause.
  const status = clientErrorStatus(error as HttpError);
  if (status) {
    logger.warn(
      `${req.method} ${requestUrlForLog(req)} -> ${status}: ${error.message}`
    );
    res.status(status).json({
      success: false,
      error: (error as HttpError).type || 'Request rejected',
      message: error.message,
      stack: isDevelopment ? error.stack : undefined,
    });
    return;
  }

  logger.error(`${req.method} ${requestUrlForLog(req)} -> 500`, error);
  res
    .status(500)
    .send(
      isDevelopment
        ? { message: error.message }
        : { message: 'Internal server error' }
    );
};
