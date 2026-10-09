/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import { HARD_OBJECT_BYTES, SOFT_OBJECT_BYTES } from '../limits';
import { TooLargeError } from './errors';

/**
 * Measures the serialized value in UTF-8 bytes. Refuses above the hard limit (before any
 * request), warns above the soft one. Only the container name is logged, never the value.
 */
export function checkSize(container: string, value: unknown): number {
  const text = JSON.stringify(value);
  const bytes = text === undefined ? 0 : Buffer.byteLength(text, 'utf8');
  if (bytes > HARD_OBJECT_BYTES) {
    throw new TooLargeError('Stored object exceeds the size limit');
  }
  if (bytes > SOFT_OBJECT_BYTES) {
    logger.warn(`persistence: large object of ${bytes} bytes written to ${container}`);
  }
  return bytes;
}
