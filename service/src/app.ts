/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { Express } from 'express';
import { installGcpImageUploader } from './analytics/register';
import type { AppConfig } from './config';
import { SERVICE_BASE_PATH } from './constants/service-path';
import CustomError from './errors/custom.error';
import { initRequestContext } from './middleware/context.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { verifyMcSession } from './middleware/mc-session.middleware';
import { serviceRouter } from './routes/service.route';
import { installRegistryProviders, registry } from './tool-sources';
import { registerChatBodyParser } from './utils/chat-body-parser';
import { registerFeedbackBodyParser } from './utils/feedback-body-parser';
import { requestUrlForLog } from './utils/log-url.utils';
import { logger } from './utils/logger.utils';

export function createApp(config: AppConfig): Express {
  // The tool-source registry feeds the tools menu and the suggestions prompt (change G seams).
  installRegistryProviders(registry);
  // Image generation is on whenever Google Cloud is configured (change L).
  installGcpImageUploader(config);

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

  // Feedback snapshots carry the client's whole in-memory useChat array and exceed the 100kb
  // body-parser default. Registered BEFORE the global parser (body-parser sets req._body and
  // the global instance short-circuits on it) and AFTER session verification, so an anonymous
  // caller cannot make the service parse a large body. See utils/feedback-body-parser.ts.
  registerFeedbackBodyParser(app, verifyMcSession);
  // Chat messages with attached images exceed 100kb too; same ordering rule, own limit.
  registerChatBodyParser(app, verifyMcSession);

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

  // SERVICE_BASE_PATH MUST equal `endpoint` of the service entry in connect.yaml.
  app.use(SERVICE_BASE_PATH, serviceRouter);

  // Synchronous throw: Express catches it and forwards to errorMiddleware.
  app.use('*', () => {
    throw new CustomError(404, 'Path not found.');
  });

  // Global error handler (must be last).
  app.use(errorMiddleware);

  return app;
}
