/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestHandler, Response } from 'express';
import { getServices } from '../services/registry';
import type { ChatSession } from '../types/chat.types';
import type { AuthenticatedRequest } from '../types/request.types';
import { fail } from '../utils/api-response';

/**
 * Loads `:sessionId` once and answers 404 when it does not exist or is not the caller's
 * (ownership is by the verified user id only; a foreign id and a missing id look the same).
 * The session is then available as `res.locals.session`. Also used on the stream route.
 */
export const loadSession: RequestHandler = async (req, res, next) => {
  try {
    const user = (req as Partial<AuthenticatedRequest>).user;
    const session = user
      ? await getServices().sessions.get(req.params.sessionId, user)
      : null;
    if (!session) {
      fail(res, 404, 'Session not found');
      return;
    }
    res.locals.session = session;
    next();
  } catch (error) {
    next(error);
  }
};

export const getLoadedSession = (res: Response): ChatSession =>
  res.locals.session as ChatSession;
