/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { verifyMcSession } from '../middleware/mc-session.middleware';
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
serviceRouter.use('/suggestions', verifyMcSession, suggestionsRouter);
serviceRouter.use('/system-prompt', verifyMcSession, systemPromptRouter);
serviceRouter.use('/tool-call-logs', verifyMcSession, toolCallLogsRouter);
// H..N mount their routers here.
