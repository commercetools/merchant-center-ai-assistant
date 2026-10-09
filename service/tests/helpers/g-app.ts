/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { Express, RequestHandler } from 'express';
import { setUserInContext } from '../../src/context/request-context';
import { initRequestContext } from '../../src/middleware/context.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import type { Persistence } from '../../src/persistence';
import { MemoryObjectGateway } from '../../src/persistence/gateway/memory.gateway';
import type { ObjectGateway } from '../../src/persistence/gateway/types';
import { sessionRouter } from '../../src/routes/session.route';
import {
  systemPromptRouter,
  toolCallLogsRouter,
} from '../../src/routes/settings.route';
import { suggestionsRouter } from '../../src/routes/suggestions.route';
import {
  createServices,
  resetServicesForTests,
  setServicesForTests,
  type Services,
} from '../../src/services/registry';
import type { SuggestionsDeps } from '../../src/services/suggestions.service';
import { clearSessionCleanupHooksForTests } from '../../src/services/session.service';
import type { RequestUser } from '../../src/types/request.types';
import { makePersistence } from './persistence';

/** Test identity headers (stand-in for the verified gateway token). */
export const asUser = (userId: string, isAdmin = false) => ({
  'x-test-user': userId,
  'x-test-admin': String(isAdmin),
});

/** Sets `req.user` from the test headers, like `verifyMcSession` would from a verified JWT. */
export const fakeAuth: RequestHandler = (req, _res, next) => {
  const userId = req.headers['x-test-user'];
  if (typeof userId !== 'string') {
    next(Object.assign(new Error('unauthenticated'), { status: 401 }));
    return;
  }
  const user: RequestUser = {
    userId,
    projectKey: 'p',
    isAdmin: req.headers['x-test-admin'] === 'true',
  };
  (req as unknown as { user: RequestUser }).user = user;
  setUserInContext(user);
  next();
};

export interface TestApp {
  app: Express;
  services: Services;
  persistence: Persistence;
  mem: MemoryObjectGateway;
}

/** The G routers over an in-memory persistence layer (optionally a wrapped gateway). */
export function makeGApp(
  o: {
    wrap?: (gw: MemoryObjectGateway) => ObjectGateway;
    generateSuggestions?: SuggestionsDeps['generate'];
    env?: NodeJS.ProcessEnv;
  } = {}
): TestApp {
  clearSessionCleanupHooksForTests();
  const { p, mem } = makePersistence(o.wrap, o.env);
  const services = createServices(p, { generateSuggestions: o.generateSuggestions });
  setServicesForTests(services);

  const app = express();
  app.use(initRequestContext);
  app.use(bodyParser.json());
  app.use('/service/session', fakeAuth, sessionRouter);
  app.use('/service/suggestions', fakeAuth, suggestionsRouter);
  app.use('/service/system-prompt', fakeAuth, systemPromptRouter);
  app.use('/service/tool-call-logs', fakeAuth, toolCallLogsRouter);
  app.use(errorMiddleware);
  return { app, services, persistence: p, mem };
}

export const resetGApp = (): void => {
  resetServicesForTests();
  clearSessionCleanupHooksForTests();
};
