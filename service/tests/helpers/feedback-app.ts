/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { Express, RequestHandler } from 'express';
import { initRequestContext } from '../../src/middleware/context.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import type { Persistence } from '../../src/persistence';
import type { MemoryObjectGateway } from '../../src/persistence/gateway/memory.gateway';
import type { ObjectGateway } from '../../src/persistence/gateway/types';
import { createBackofficeRouter } from '../../src/routes/backoffice.route';
import { createFeedbackRouter } from '../../src/routes/feedback.route';
import { BackofficeService } from '../../src/services/backoffice.service';
import { FeedbackService } from '../../src/services/feedback.service';
import type { AuthenticatedRequest } from '../../src/types/request.types';
import { makePersistence } from './persistence';

/**
 * Test-only authentication: `x-test-user` / `x-test-admin` build `req.user`. The real routers
 * take `verifyMcSession`; the tests swap it so they can pick the verified identity directly.
 * Everything else a request carries (query, other headers, body) stays untrusted.
 */
export const fakeAuth: RequestHandler = (req, res, next) => {
  const userId = req.header('x-test-user');
  if (!userId) {
    res.status(401).json({ message: 'no test user' });
    return;
  }
  (req as AuthenticatedRequest).user = {
    userId,
    projectKey: 'p',
    isAdmin: req.header('x-test-admin') === 'true',
  };
  next();
};

export interface FeedbackHarness {
  app: Express;
  p: Persistence;
  mem: MemoryObjectGateway;
  feedback: FeedbackService;
  backoffice: BackofficeService;
}

export function makeFeedbackHarness(
  wrap?: (gw: MemoryObjectGateway) => ObjectGateway,
  deps: { now?: () => number; newId?: () => string } = {}
): FeedbackHarness {
  const { p, mem } = makePersistence(wrap);
  const feedback = new FeedbackService({
    sessions: p.sessions,
    messages: p.messages,
    feedback: p.feedback,
    settings: p.settings,
    ...deps,
  });
  const backoffice = new BackofficeService({
    sessions: p.sessions,
    messages: p.messages,
  });
  const app = express();
  app.use(initRequestContext);
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use('/service/feedback', createFeedbackRouter(() => feedback, fakeAuth));
  app.use('/service/backoffice', createBackofficeRouter(() => backoffice, fakeAuth));
  app.use(errorMiddleware);
  return { app, p, mem, feedback, backoffice };
}

export const asUser = (id: string, admin = false): Record<string, string> => ({
  'x-test-user': id,
  ...(admin ? { 'x-test-admin': 'true' } : {}),
});
