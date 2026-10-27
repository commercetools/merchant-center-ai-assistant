/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import {
  createSession,
  deleteSession,
  getDigest,
  getLastSession,
  getMessages,
  getSession,
  listSessions,
  updateSession,
} from '../controllers/session.controller';
import {
  getSessionTools,
  updateSessionTools,
} from '../controllers/tools.controller';
import { featureFlagsMiddleware } from '../middleware/feature-flags.middleware';
import { loadSession } from '../middleware/load-session.middleware';

/**
 * Mounted at `/service/session` behind `verifyMcSession`. `/all` is registered before
 * `/:sessionId` so it is not captured by it.
 */
export const sessionRouter = Router();

sessionRouter.use(featureFlagsMiddleware);

sessionRouter.post('/', createSession);
sessionRouter.get('/', getLastSession);
sessionRouter.get('/all', listSessions);
sessionRouter.get('/:sessionId', loadSession, getSession);
sessionRouter.put('/:sessionId', loadSession, updateSession);
sessionRouter.delete('/:sessionId', loadSession, deleteSession);
sessionRouter.get('/:sessionId/messages', loadSession, getMessages);
sessionRouter.get('/:sessionId/digest', loadSession, getDigest);
sessionRouter.get('/:sessionId/tools', loadSession, getSessionTools);
// Alias kept for the legacy client, which calls the menu with POST.
sessionRouter.post('/:sessionId/tools', loadSession, getSessionTools);
sessionRouter.put('/:sessionId/tools', loadSession, updateSessionTools);
