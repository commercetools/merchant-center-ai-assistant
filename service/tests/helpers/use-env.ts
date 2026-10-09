/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { baseEnv } from './env';

/**
 * Makes the cached `readConfiguration()` (used by modules under test)
 * read `baseEnv(extra)` from `process.env`. Restores nothing: call
 * `resetConfigurationForTests()` in `afterEach`.
 */
export function useEnv(extra: NodeJS.ProcessEnv = {}): void {
  resetConfigurationForTests();
  const env = baseEnv(extra);
  for (const key of Object.keys(process.env)) {
    if (/^(GCP_|GEMINI_|IMAGE_URL_MODE|GOOGLE_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, env);
}
