/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { createFilesRouter } from '../storage/files-route';
import { verifyMcSession } from '../middleware/mc-session.middleware';
import { aiChatRouter } from './ai-chat.route';
import { backofficeRouter } from './backoffice.route';
import { feedbackRouter } from './feedback.route';
import { mcAuthRouter } from './mc-auth.route';
import { sessionRouter } from './session.route';
import { systemPromptRouter, toolCallLogsRouter } from './settings.route';
import { statusRouter } from './status.route';
import { suggestionsRouter } from './suggestions.route';

/** Mounted at /service in app.ts; MUST equal `endpoint` in connect.yaml. */
export const serviceRouter = Router();

serviceRouter.use('/', statusRouter);
serviceRouter.use('/auth', mcAuthRouter);
serviceRouter.use('/session', verifyMcSession, sessionRouter);
serviceRouter.use('/ai-chat', aiChatRouter);
serviceRouter.use('/suggestions', verifyMcSession, suggestionsRouter);
serviceRouter.use('/system-prompt', verifyMcSession, systemPromptRouter);
serviceRouter.use('/tool-call-logs', verifyMcSession, toolCallLogsRouter);
serviceRouter.use('/feedback', feedbackRouter);
serviceRouter.use('/backoffice', backofficeRouter);
// L: private generated images, streamed to the session owner or an administrator.
serviceRouter.use('/files', verifyMcSession, createFilesRouter());
// I..M mount their routers here.
