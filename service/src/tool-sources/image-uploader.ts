/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ImageUploader } from './types';

let uploader: ImageUploader | undefined;

/**
 * Change L registers its Cloud Storage uploader here (whenever Google Cloud is configured).
 * Without an uploader the `imageGeneration` source is disabled: the feature is absent rather
 * than broken.
 */
export const setImageUploader = (value: ImageUploader | undefined): void => {
  uploader = value;
};

export const getImageUploader = (): ImageUploader | undefined => uploader;
