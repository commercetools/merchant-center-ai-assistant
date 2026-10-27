/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { Express, RequestHandler } from 'express';
import { initRequestContext } from '../../src/middleware/context.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { verifyMcSession } from '../../src/middleware/mc-session.middleware';
import { requireAdmin } from '../../src/middleware/require-admin.middleware';
import { AUDIENCE_ORIGIN } from './mc-jwt';

export const authEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  CONNECT_SERVICE_URL: AUDIENCE_ORIGIN,
  ...extra,
});

/**
 * Minimal app with one verified route and one admin-only route. Same middleware order as
 * createApp.
 */
export function probeApp(
  handler: RequestHandler,
  adminHandler: RequestHandler = handler
): Express {
  const app = express();
  app.use(initRequestContext);
  app.use(bodyParser.json());
  app.post('/service/probe', verifyMcSession, handler);
  app.post('/service/admin-probe', verifyMcSession, requireAdmin, adminHandler);
  app.use(errorMiddleware);
  return app;
}
