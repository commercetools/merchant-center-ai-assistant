/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestHandler, Response } from 'express';
import { readConfiguration } from '../config';
import { RequestBudget } from './request-budget';

/**
 * First middleware of the stream route: starts the clock at the request start, so the time
 * spent before streaming (authentication, session lookup, history read, source resolution)
 * counts against the budget, and wires the client disconnect.
 *
 * A closed connection before the response has ended aborts `budget.hardSignal`, which stops
 * the model run; the turn's `onFinish` persistence still runs for whatever completed.
 */
export const startBudget: RequestHandler = (_req, res, next) => {
  const { chat } = readConfiguration();
  const clientGone = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) clientGone.abort();
  });
  const budget = new RequestBudget(
    Date.now(),
    chat.requestBudgetMs,
    chat.finalizeReserveMs,
    clientGone.signal
  );
  // A request that is rejected before the controller runs must not leave timers behind.
  res.on('close', () => budget.dispose());
  res.locals.budget = budget;
  next();
};

export const getRequestBudget = (res: Response): RequestBudget =>
  res.locals.budget as RequestBudget;
