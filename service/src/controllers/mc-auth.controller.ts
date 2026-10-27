/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler } from 'express';
import { runContributors } from '../auth/bootstrap-registry';
import type { AuthenticatedRequest } from '../types/request.types';
import { logger } from '../utils/logger.utils';

/**
 * Bootstrap for the Merchant Center apps. Reads only req.user (verified); the
 * request body is never echoed. No token, no registration, no persistence.
 */
export const bootstrapSession: RequestHandler = async (req, res) => {
  const authed = req as AuthenticatedRequest;
  const { user } = authed;
  try {
    const contributions = await runContributors(authed);
    res.status(200).json({
      success: true,
      data: {
        ...contributions,
        projectKey: user.projectKey,
        userId: user.userId,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    logger.error('bootstrap failed', error);
    res
      .status(500)
      .json({ success: false, error: 'Failed to establish session' });
  }
};
