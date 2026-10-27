/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const EXTENSION_BY_TYPE: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** The single source of the response content type of the files route. */
export const TYPE_BY_EXTENSION: Record<string, ImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const FILES_PATH_PREFIX = '/files';
export const FILE_NAME_PATTERN = /^[0-9]{10,15}-[a-f0-9]{8}\.(png|jpg|webp|gif)$/;
export const IMAGE_OBJECT_PREFIX = 'images/';
/** Width of the thumbnails sent back to the model. */
export const MODEL_IMAGE_WIDTH = 200;
