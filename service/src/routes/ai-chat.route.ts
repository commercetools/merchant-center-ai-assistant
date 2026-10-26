/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Router } from 'express';
import { startBudget } from '../chat/budget.middleware';
import { sendAiChatMessage } from '../chat/chat.controller';
import {
  cancelChatStream,
  replayChatStream,
} from '../chat/stream-resume.controller';
import { loadSession } from '../middleware/load-session.middleware';
import { verifyMcSession } from '../middleware/mc-session.middleware';

/**
 * Mounted at `/service/ai-chat`. The route is a route PATH (not a `use()` mount) so the
 * published route table can list it; authentication is part of the chain because the budget
 * clock has to start before it.
 */
export const aiChatRouter = Router();

aiChatRouter.post(
  '/:sessionId/message/stream',
  startBudget,
  verifyMcSession,
  loadSession,
  sendAiChatMessage
);

/**
 * Reattach to the running turn after the gateway cut the POST (see `turn-buffer.ts`). No
 * budget clock: the replay ends when the turn does, and the turn has its own budget.
 */
aiChatRouter.get(
  '/:sessionId/message/stream',
  verifyMcSession,
  loadSession,
  replayChatStream
);

aiChatRouter.delete(
  '/:sessionId/message/stream',
  verifyMcSession,
  loadSession,
  cancelChatStream
);
