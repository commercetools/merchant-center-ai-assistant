/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Re-encrypts stored identity tokens, PKCE verifiers and the OAuth client with the primary
// ENCRYPTION_KEY after a rotation (set the old key in ENCRYPTION_KEY_PREVIOUS first).
// Usage (after `npm run build`):
//   node --env-file=.env.local scripts/reencrypt.mjs [--dry-run]
// Prints counts only, never values.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reencryptAll } = require('../build/persistence/maintenance.js');
const { CustomObjectGateway } = require('../build/persistence/gateway/custom-object.gateway.js');
const { loadKeys } = require('../build/crypto/keys.js');

try {
  const r = await reencryptAll(new CustomObjectGateway(), loadKeys(), {
    dryRun: process.argv.includes('--dry-run'),
  });
  process.stdout.write(
    `tokens=${r.tokens} authStates=${r.authStates} settings=${r.settings} failed=${r.failed}\n`
  );
  if (r.failed > 0) process.exit(1);
} catch (e) {
  process.stderr.write(`reencrypt failed: ${e instanceof Error ? e.message : 'unknown error'}\n`);
  process.exit(1);
}
