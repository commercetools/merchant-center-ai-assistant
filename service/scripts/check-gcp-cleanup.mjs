/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// E2E-L-07: after a session is deleted, nothing of it may be left in Google Cloud.
// Counts the session's temporary BigQuery tables and its generated images and prints
//   tables: <n>, images: <m>
// Exit codes: 0 both are 0, 1 something is left or the check failed, 2 bad usage,
// 3 no Google credentials (nothing was checked). Read-only: it never deletes anything.
// Usage (after `npm run build`):
//   node --env-file=.env.local scripts/check-gcp-cleanup.mjs <sessionId>
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const sessionId = process.argv[2];
if (!sessionId || !/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) {
  process.stderr.write('usage: check-gcp-cleanup.mjs <sessionId>\n');
  process.exit(2);
}
if (!process.env.GCP_SA_KEY_BASE64) {
  process.stderr.write('GCP_SA_KEY_BASE64 is not set: nothing was checked\n');
  process.exit(3);
}

try {
  const { countSessionResidue, gcpResiduePorts } = require('../build/gcp/session-residue.js');
  const { tables, images } = await countSessionResidue(sessionId, gcpResiduePorts());
  process.stdout.write(`tables: ${tables}, images: ${images}\n`);
  process.exit(tables === 0 && images === 0 ? 0 : 1);
} catch (error) {
  process.stderr.write(`check failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exit(1);
}
