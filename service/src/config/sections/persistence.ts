/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// OWNED BY SPEC E - replace body, keep the exported type and the production guard.
import { Secret } from '../secret';
import { int, oneOf, str } from '../parse';
import { SectionParser } from '../types';

export const PERSISTENCE_DRIVERS = ['custom-objects', 'memory'] as const;

export interface PersistenceConfig {
  driver: (typeof PERSISTENCE_DRIVERS)[number];
  encryptionKey?: Secret<string>;
  encryptionKeyPrevious?: Secret<string>;
  concurrency: number;
}

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
    errors.push('PERSISTENCE_DRIVER: memory is not allowed when NODE_ENV=production');
  }
  const key = str(env, 'ENCRYPTION_KEY');
  const previous = str(env, 'ENCRYPTION_KEY_PREVIOUS');
  return {
    errors,
    value: {
      driver,
      encryptionKey: key ? new Secret(key) : undefined,
      encryptionKeyPrevious: previous ? new Secret(previous) : undefined,
      concurrency: int(env, 'PERSISTENCE_CONCURRENCY', 8, { min: 1 }, errors),
    },
  };
};
