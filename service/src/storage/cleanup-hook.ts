/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { SessionCleanupHook } from '../services/session.service';
import { logger } from '../utils/logger.utils';
import { IMAGE_OBJECT_PREFIX } from './constants';
import { bucket, errorCode, gcpConfigured } from './ports';

/**
 * Deletes every object under `images/{sessionId}/` (the trailing slash keeps `images/ab` from
 * matching `images/abc/`). Skipped without a service-account key; a missing bucket is success;
 * never throws, so it cannot stop the other hook.
 */
export const imageCleanupHook: SessionCleanupHook = async (session) => {
  if (!gcpConfigured()) return;
  try {
    await bucket().deleteFiles({ prefix: `${IMAGE_OBJECT_PREFIX}${session.id}/` });
  } catch (error) {
    if (errorCode(error) === 404) return;
    logger.error(`Image cleanup failed for session ${session.id}`, {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
};
