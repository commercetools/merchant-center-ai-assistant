/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration, resetConfigurationForTests } from '../../src/config';

/** Smallest valid environment (memory driver relaxes the credentials). */
export const baseEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  CTP_PROJECT_KEY: 'p',
  CTP_REGION: 'us-central1.gcp',
  PERSISTENCE_DRIVER: 'memory',
  ...extra,
});

/** Fresh configuration for one test (the real one is cached per process). */
export function freshConfig(extra: NodeJS.ProcessEnv = {}) {
  resetConfigurationForTests();
  return readConfiguration(baseEnv(extra));
}

export const fullCtpEnv: NodeJS.ProcessEnv = {
  CTP_CLIENT_ID: 'cid',
  CTP_CLIENT_SECRET: 'csecret-value',
  CTP_SCOPE: 'view_key_value_documents manage_key_value_documents',
  CTP_API_URL: 'https://api.example.test',
  CTP_AUTH_URL: 'https://auth.example.test',
};
