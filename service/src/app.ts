/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { Express } from 'express';
import type { AppConfig } from './config';
import CustomError from './errors/custom.error';
import { initRequestContext } from './middleware/context.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { serviceRouter } from './routes/service.route';
import { requestUrlForLog } from './utils/log-url.utils';
import { logger } from './utils/logger.utils';

export function createApp(config: AppConfig): Express {
  const app = express();
  app.disable('x-powered-by');

  // First: everything after this can read the correlation id.
  app.use(initRequestContext);

  // HTTP trace (LOG_HTTP=true), before everything else so a request is logged
  // even when a later middleware rejects it. Never logs bodies or credentials.
  if (config.server.logHttp) {
    app.use((req, _res, next) => {
      logger.info(
        `--> ${req.method} ${requestUrlForLog(req)} ` +
          `auth=${req.headers.authorization ? 'yes' : 'no'}`
      );
      next();
    });
  }

  // No CORS middleware: traffic is server-to-server from the Merchant Center
  // gateway (/proxy/forward-to), never a browser.

  // Feedback snapshots carry the client's whole in-memory useChat array and
  // exceed the 100kb body-parser default. Registered BEFORE the global parser:
  // body-parser sets req._body and the global instance short-circuits on it, so
  // a route-level parser (or one registered later) would never run. The path
  // must be the FULL mount path because this is registered on `app`.
  app.use(
    '/service/feedback/submit',
    bodyParser.json({ limit: config.server.feedbackBodyLimit })
  );

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${requestUrlForLog(req)}`, {
      headers: {
        authorization: req.headers.authorization ? '[REDACTED]' : undefined,
        'content-type': req.headers['content-type'],
      },
    });
    next();
  });

  // MUST equal `endpoint` of the service entry in connect.yaml.
  app.use('/service', serviceRouter);

  // Synchronous throw: Express catches it and forwards to errorMiddleware.
  app.use('*', () => {
    throw new CustomError(404, 'Path not found.');
  });

  // Global error handler (must be last).
  app.use(errorMiddleware);

  return app;
}
