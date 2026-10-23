/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../types/request.types';
import { auditAdminAction } from '../utils/audit';
import { requireAdmin } from './require-admin.middleware';

/** `requireAdmin` plus an `audit.admin_action` line with `outcome: 'denied'` on refusal. */
export const requireAdminAudited =
  (action: string, route: string): RequestHandler =>
  (req, res, next) => {
    requireAdmin(req, res, (err?: unknown) => {
      const user = (req as Partial<AuthenticatedRequest>).user;
      if (err && user) {
        auditAdminAction({ userId: user.userId, action, route, outcome: 'denied' });
      }
      next(err);
    });
  };
