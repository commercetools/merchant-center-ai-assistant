/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { readConfiguration } from '../config';
import CustomError from '../errors/custom.error';
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

export const errorMiddleware: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
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
