/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runWithContext } from '../context/request-context';

export function initRequestContext(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const requestId = uuidv4();
  const correlationId = (req.header('x-correlation-id') ?? requestId).slice(
    0,
    128
  );
  runWithContext({ requestId, correlationId }, () => next());
}
