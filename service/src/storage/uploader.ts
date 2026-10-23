/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ImageUploader } from '../tool-sources/types';
import { logger } from '../utils/logger.utils';
import { convertMessagesForModel } from './file-parts';
import { BucketUnavailableError } from './ensure-bucket';
import { ImageRejectedError, putImage } from './gcs-objects';

/**
 * Change H's `ImageUploader` over a private bucket. A failed upload is logged and answered
 * with `''` so the stream continues (H's storage filter then drops the base64 part).
 */
export const createGcsImageUploader = (): ImageUploader => ({
  async upload(bytes, mediaType, sessionId) {
    try {
      return (await putImage(bytes, mediaType, sessionId)).value;
    } catch (error) {
      if (error instanceof ImageRejectedError) {
        logger.warn(`Generated image not stored: ${error.message}`, { sessionId });
      } else if (!(error instanceof BucketUnavailableError)) {
        // BucketUnavailableError was logged once, with the fix, by ensureBucket().
        logger.error('Generated image upload failed', {
          sessionId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
      return '';
    }
  },
  toModelMessages: (messages, context) =>
    convertMessagesForModel(messages, { sessionId: context?.sessionId }),
});
