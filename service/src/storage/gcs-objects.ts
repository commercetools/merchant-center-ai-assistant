/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.utils';
import {
  EXTENSION_BY_TYPE,
  FILES_PATH_PREFIX,
  IMAGE_MAX_BYTES,
  IMAGE_OBJECT_PREFIX,
  IMAGE_TYPES,
  type ImageType,
} from './constants';
import { ensureBucket } from './ensure-bucket';
import { bucket, errorCode, storageTarget } from './ports';

/** A generated file that is not stored (type or size); the message is safe to log. */
export class ImageRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

const isImageType = (value: string): value is ImageType =>
  (IMAGE_TYPES as readonly string[]).includes(value);

export interface PutImageResult {
  /** `/files/{sessionId}/{file}` (private) or the public bucket URL (public mode). */
  value: string;
  objectName: string;
}

/**
 * Stores an image as `images/{sessionId}/{timestamp}-{random8}.{ext}`. Objects are never made
 * public per object (no ACL, no `makePublic`, no signed URL); the bucket decides. A missing
 * bucket is detected from the 404 of the write (never `bucket.exists()`, which needs
 * `storage.buckets.get`), created once, and the write retried once.
 */
export async function putImage(
  bytes: Uint8Array,
  mediaType: string,
  sessionId: string
): Promise<PutImageResult> {
  if (!isImageType(mediaType)) {
    throw new ImageRejectedError(`media type ${mediaType} is not stored`);
  }
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new ImageRejectedError(
      `image of ${bytes.byteLength} bytes exceeds the ${IMAGE_MAX_BYTES} byte limit`
    );
  }

  const t = storageTarget();
  const fileName = `${Date.now()}-${randomUUID().replace(/-/g, '').substring(0, 8)}.${EXTENSION_BY_TYPE[mediaType]}`;
  const objectName = `${IMAGE_OBJECT_PREFIX}${sessionId}/${fileName}`;
  const buffer = Buffer.from(bytes);
  const options = {
    resumable: false,
    metadata: {
      contentType: mediaType,
      cacheControl: t.mode === 'private' ? 'private, no-store' : 'public, max-age=3600',
    },
  };

  try {
    await bucket().file(objectName).save(buffer, options);
  } catch (error) {
    if (errorCode(error) !== 404) throw error;
    await ensureBucket();
    await bucket().file(objectName).save(buffer, options);
  }

  logger.info('Image stored', { sessionId, bytes: bytes.byteLength });
  const value =
    t.mode === 'private'
      ? `${FILES_PATH_PREFIX}/${sessionId}/${fileName}`
      : `https://storage.googleapis.com/${t.bucketName}/${objectName}`;
  return { value, objectName };
}
