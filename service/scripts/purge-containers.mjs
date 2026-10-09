/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Deletes every Custom Object the connector wrote under a container prefix.
// Usage (after `npm run build`):
//   node --env-file=.env.local scripts/purge-containers.mjs --prefix ai-assistant-it-abc123
// Prefixes that do not start with `ai-assistant-it-` need --i-know (this deletes real data).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { purgeContainers } = require('../build/persistence/maintenance.js');
const { CustomObjectGateway } = require('../build/persistence/gateway/custom-object.gateway.js');

const args = process.argv.slice(2);
const at = args.indexOf('--prefix');
const prefix = at >= 0 ? args[at + 1] : undefined;
if (!prefix) {
  process.stderr.write('usage: purge-containers.mjs --prefix <prefix> [--i-know]\n');
  process.exit(2);
}

try {
  const r = await purgeContainers(new CustomObjectGateway(), {
    prefix,
    allowAnyPrefix: args.includes('--i-know'),
  });
  process.stdout.write(`purged ${r.objects} objects in ${r.containers} containers\n`);
} catch (e) {
  process.stderr.write(`purge failed: ${e instanceof Error ? e.message : 'unknown error'}\n`);
  process.exit(1);
}
