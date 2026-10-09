/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler, Router } from 'express';
import { feedbackController } from '../controllers/feedback.controller';
import { verifyMcSession } from '../middleware/mc-session.middleware';
import { requireAdminAudited } from '../middleware/require-admin-audited.middleware';
import { getPersistence } from '../persistence';
import { FeedbackService } from '../services/feedback.service';

export const defaultFeedbackService = (): FeedbackService => {
  const p = getPersistence();
  return new FeedbackService({
    sessions: p.sessions,
    messages: p.messages,
    feedback: p.feedback,
    settings: p.settings,
  });
};

/**
 * `POST /submit` is open to any verified member (ownership is checked in the service);
 * the review endpoints are admin only. `authenticate` is injectable for tests.
 */
export function createFeedbackRouter(
  getService: () => FeedbackService = defaultFeedbackService,
  authenticate: RequestHandler = verifyMcSession
): Router {
  const router = Router();
  const c = feedbackController(getService);
  router.post('/submit', authenticate, c.submit);
  router.get(
    '/fetch',
    authenticate,
    requireAdminAudited('feedback.listed', '/service/feedback/fetch'),
    c.list
  );
  router.get(
    '/fetch/:feedbackId',
    authenticate,
    requireAdminAudited('feedback.read', '/service/feedback/fetch/:feedbackId'),
    c.detail
  );
  return router;
}

export const feedbackRouter = createFeedbackRouter();
