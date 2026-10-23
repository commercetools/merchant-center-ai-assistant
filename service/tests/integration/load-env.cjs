/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Loads service/.env.local when it exists; values already in the environment win.
try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: the suites skip themselves
}
