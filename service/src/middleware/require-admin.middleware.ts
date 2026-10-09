/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler } from 'express';
import CustomError from '../errors/custom.error';
import type { AuthenticatedRequest } from '../types/request.types';
import { logger } from '../utils/logger.utils';

/** Runs after verifyMcSession; reads only req.user.isAdmin. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const user = (req as Partial<AuthenticatedRequest>).user;
  if (!user) return next(new CustomError(401, 'Authentication required'));
  if (!user.isAdmin) {
    return next(
      new CustomError(403, 'Access denied: administrator access required', {
        code: 'ADMIN_REQUIRED',
      })
    );
  }
  next();
};

/** One line per admin-only mutation. Never contains an e-mail address. */
export function auditAdminAction(
  req: AuthenticatedRequest,
  route: string,
  outcome: 'ok' | 'failed'
): void {
  logger.info('audit.admin_action', {
    userId: req.user.userId,
    route,
    outcome,
  });
}
