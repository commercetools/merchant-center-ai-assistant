/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runWithContext } from '../context/request-context';

const CORRELATION_HEADER = 'X-Correlation-Id';
/** Visible ASCII only, so the value is safe to echo in a response header and to log. */
const SAFE_CORRELATION_ID = /^[\x21-\x7e]+$/;

export function initRequestContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = uuidv4();
  const supplied = (req.header(CORRELATION_HEADER) ?? '').slice(0, 128);
  const correlationId = SAFE_CORRELATION_ID.test(supplied)
    ? supplied
    : requestId;
  // Echoed on every response (success, error, stream) so a caller can quote it in a report.
  res.setHeader(CORRELATION_HEADER, correlationId);
  runWithContext({ requestId, correlationId }, () => next());
}
