/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createHash } from 'node:crypto';
import { readConfiguration } from '../config';

export interface KeyRing {
  /** Used for every new encryption. */
  primary: Buffer;
  /** Retired keys, used for decryption only. */
  previous: Buffer[];
}

/** Key id: the first 8 hex characters of the SHA-256 of the key. */
export const kidOf = (key: Buffer): string =>
  createHash('sha256').update(key).digest('hex').slice(0, 8);

export function loadKeys(): KeyRing {
  const { encryptionKey, previousEncryptionKeys } = readConfiguration().persistence;
  return {
    primary: encryptionKey.reveal(),
    previous: previousEncryptionKeys.map((k) => k.reveal()),
  };
}

/** Finds the key with the given id among the primary and the retired keys. */
export function findKey(ring: KeyRing, kid: string): Buffer | undefined {
  return [ring.primary, ...ring.previous].find((k) => kidOf(k) === kid);
}
