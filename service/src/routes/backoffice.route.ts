/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler, Router } from 'express';
import { backofficeController } from '../controllers/backoffice.controller';
import { verifyMcSession } from '../middleware/mc-session.middleware';
import { requireAdminAudited } from '../middleware/require-admin-audited.middleware';
import { getPersistence } from '../persistence';
import { BackofficeService } from '../services/backoffice.service';

export const defaultBackofficeService = (): BackofficeService => {
  const p = getPersistence();
  return new BackofficeService({ sessions: p.sessions, messages: p.messages });
};

export function createBackofficeRouter(
  getService: () => BackofficeService = defaultBackofficeService,
  authenticate: RequestHandler = verifyMcSession
): Router {
  const router = Router();
  const c = backofficeController(getService);
  router.get('/is-admin', authenticate, c.isAdmin);
  router.post(
    '/threads',
    authenticate,
    requireAdminAudited('backoffice.threads.listed', '/service/backoffice/threads'),
    c.threads
  );
  router.get(
    '/threads/:sessionId',
    authenticate,
    requireAdminAudited('backoffice.thread.read', '/service/backoffice/threads/:sessionId'),
    c.thread
  );
  return router;
}

export const backofficeRouter = createBackofficeRouter();
