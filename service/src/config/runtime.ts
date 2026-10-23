/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * True when the process runs as production. Same rule as `readConfiguration()`: an unset or
 * blank NODE_ENV means production. For guards in modules that must not need a valid
 * configuration (for example the in-memory test double).
 */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.NODE_ENV?.trim();
  return raw === undefined || raw === '' || raw === 'production';
}
