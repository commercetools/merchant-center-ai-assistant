/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import type { Express, RequestHandler } from 'express';
import { SERVICE_BASE_PATH } from '../constants/service-path';

/**
 * JSON body limit of `POST /service/ai-chat/:sessionId/message/stream`.
 *
 * The body carries one user message, and a message can hold attached images as `data:` URLs
 * and annotation payloads, which exceed the 100 kb body-parser default (Q-impl-29: such a
 * message got 413). 10 MB is the same ceiling as the feedback upload: it was measured to pass
 * the Merchant Center gateway and it stays below the 14 MB request-body ceiling of the
 * platform. The limit is only applied after authentication (see below), and every other route
 * keeps the global 100 kb limit.
 */
export const CHAT_BODY_LIMIT = '10mb';

/** Full path pattern of the stream route, as mounted by `app.ts`. */
export const chatStreamPath = (basePath: string = SERVICE_BASE_PATH): string =>
  `${basePath}/ai-chat/:sessionId/message/stream`;

/**
 * Registers the raised JSON parser for the chat stream route. Same ordering rule as
 * `registerFeedbackBodyParser`: it must be registered BEFORE the global parser (body-parser
 * sets `req._body` and the later global instance skips an already parsed request) and it runs
 * behind `auth`, so an anonymous caller is answered 401 before any body byte is parsed. The
 * route itself verifies the session again, which is cheap and keeps the route table honest.
 */
export const registerChatBodyParser = (
  app: Express,
  auth: RequestHandler,
  basePath: string = SERVICE_BASE_PATH,
  parser: RequestHandler = bodyParser.json({ limit: CHAT_BODY_LIMIT })
): void => {
  app.post(chatStreamPath(basePath), auth, parser);
};
