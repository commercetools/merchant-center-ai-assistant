/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import type { Express, RequestHandler } from 'express';
import { SERVICE_BASE_PATH } from '../constants/service-path';
import { FEEDBACK_BODY_LIMIT } from './feedback-snapshot';

/**
 * Registers the raised (10 MiB) JSON parser for `POST /service/feedback/submit` on the app.
 *
 * Order is the whole point. body-parser sets `req._body`, so a global parser registered later
 * short-circuits on a request this one already parsed; a route-level parser inside the router
 * would never run because the global one has already read (and rejected) the body. The path
 * is therefore the FULL mount path. `auth` runs first, so an anonymous caller is answered 401
 * before a single body byte is parsed (legacy parsed up to 25 MB for anybody).
 */
export const registerFeedbackBodyParser = (
  app: Express,
  auth: RequestHandler,
  basePath: string = SERVICE_BASE_PATH,
  parser: RequestHandler = bodyParser.json({ limit: FEEDBACK_BODY_LIMIT })
): void => {
  app.use(`${basePath}/feedback/submit`, auth, parser);
};
