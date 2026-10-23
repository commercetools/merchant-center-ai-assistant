/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Secret } from '../secret';
import { int, oneOf, str } from '../parse';
import { SectionParser } from '../types';

export const PERSISTENCE_DRIVERS = ['custom-objects', 'memory'] as const;

export interface PersistenceConfig {
  driver: (typeof PERSISTENCE_DRIVERS)[number];
  /** Maximum parallel requests of bulk operations (1..32). */
  concurrency: number;
  /** In-process settings cache lifetime in ms; 0 disables the cache. */
  settingsCacheTtlMs: number;
  /** AES-256 key (exactly 32 bytes). */
  encryptionKey: Secret<Buffer>;
  /** Retired keys, used for decryption only. */
  previousEncryptionKeys: Secret<Buffer>[];
}

/** base64 of exactly 32 bytes: 43 characters followed by one `=`. */
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

function decodeKey(raw: string): Buffer | undefined {
  if (!KEY_PATTERN.test(raw)) return undefined;
  const buf = Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : undefined;
}

const KEY_HINT =
  'must be base64 of exactly 32 bytes (generate with: openssl rand -base64 32)';

export const parsePersistence: SectionParser<PersistenceConfig> = (
  env,
  ctx
) => {
  const errors: string[] = [];
  const driver = oneOf(
    env,
    'PERSISTENCE_DRIVER',
    PERSISTENCE_DRIVERS,
    'custom-objects',
    errors
  );
  if (driver === 'memory' && ctx.nodeEnv === 'production') {
    errors.push(
      'PERSISTENCE_DRIVER: memory is not allowed when NODE_ENV=production'
    );
  }

  const concurrency = int(env, 'PERSISTENCE_CONCURRENCY', 8, { min: 1 }, errors);
  if (concurrency > 32) {
    errors.push('PERSISTENCE_CONCURRENCY: must be an integer <= 32');
  }
  const settingsCacheTtlMs = int(
    env,
    'SETTINGS_CACHE_TTL_MS',
    5000,
    { min: 0 },
    errors
  );
  if (settingsCacheTtlMs > 60000) {
    errors.push('SETTINGS_CACHE_TTL_MS: must be an integer <= 60000');
  }

  let encryptionKey: Buffer | undefined;
  const rawKey = str(env, 'ENCRYPTION_KEY');
  if (rawKey === undefined) {
    errors.push(`ENCRYPTION_KEY: is required; ${KEY_HINT}`);
  } else {
    encryptionKey = decodeKey(rawKey);
    if (!encryptionKey) errors.push(`ENCRYPTION_KEY: ${KEY_HINT}`);
  }

  const previousEncryptionKeys: Secret<Buffer>[] = [];
  const rawPrevious = str(env, 'ENCRYPTION_KEY_PREVIOUS');
  if (rawPrevious !== undefined) {
    rawPrevious
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .forEach((part, i) => {
        const key = decodeKey(part);
        if (key) previousEncryptionKeys.push(new Secret(key));
        else errors.push(`ENCRYPTION_KEY_PREVIOUS: entry ${i + 1} ${KEY_HINT}`);
      });
  }

  return {
    errors,
    value: {
      driver,
      concurrency: Math.min(concurrency, 32),
      settingsCacheTtlMs: Math.min(settingsCacheTtlMs, 60000),
      // A missing or invalid key already produced an error; the placeholder is never used.
      encryptionKey: new Secret(encryptionKey ?? Buffer.alloc(32)),
      previousEncryptionKeys,
    },
  };
};
