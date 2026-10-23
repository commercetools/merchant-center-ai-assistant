/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import {
  getSystemPrompt,
  getToolCallLogs,
  putSystemPrompt,
  putToolCallLogs,
} from '../controllers/settings.controller';
import { requireAdmin } from '../middleware/require-admin.middleware';

/** Mounted behind `verifyMcSession`; writes need an administrator. */
export const systemPromptRouter = Router();
systemPromptRouter.get('/', getSystemPrompt);
systemPromptRouter.put('/', requireAdmin, putSystemPrompt);

export const toolCallLogsRouter = Router();
toolCallLogsRouter.get('/', getToolCallLogs);
toolCallLogsRouter.put('/', requireAdmin, putToolCallLogs);
