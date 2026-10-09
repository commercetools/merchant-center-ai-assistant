/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Request, RequestHandler, Response } from 'express';

/** The success envelope: `{ success: true, data }`. */
export const ok = <T>(res: Response, data: T, status = 200): Response =>
  res.status(status).json({ success: true, data });

/** Success without data, used by DELETE: `{ success: true, message }`. */
export const okMessage = (res: Response, message: string): Response =>
  res.status(200).json({ success: true, message });

/** The failure envelope: `{ success: false, error, message? }`. */
export const fail = (
  res: Response,
  status: number,
  error: string,
  message?: string
): Response =>
  res
    .status(status)
    .json({ success: false, error, ...(message ? { message } : {}) });

/**
 * Express 4 does not catch rejected promises. Anything an async handler throws goes to
 * the error middleware, which maps persistence errors and never leaks internals.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };
