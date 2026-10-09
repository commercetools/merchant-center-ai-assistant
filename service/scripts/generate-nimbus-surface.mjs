/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Keeps the service's Nimbus surface manifest (`src/composed-pages/prompt/nimbus-surface.generated.ts`)
 * identical to the one mc-app derives from the installed `@commercetools/nimbus`.
 *
 * The service cannot install Nimbus itself (React, Chakra and react-aria in a backend), so the
 * manifest is produced by mc-app's generator and copied here:
 *
 *   node scripts/generate-nimbus-surface.mjs              # copy mc-app's committed manifest
 *   node scripts/generate-nimbus-surface.mjs --regenerate # run mc-app's generator first (needs mc-app deps)
 *   node scripts/generate-nimbus-surface.mjs --check      # exit 1 when the copies differ (version or content)
 *   --service-file <path> / --mc-file <path>              # test overrides
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ROOT = path.resolve(HERE, '..');
const MC_APP = path.resolve(SERVICE_ROOT, '../mc-app');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? path.resolve(process.cwd(), args[index + 1]) : fallback;
};

const serviceFile = option(
  '--service-file',
  path.join(
    SERVICE_ROOT,
    'src/composed-pages/prompt/nimbus-surface.generated.ts'
  )
);
const mcFile = option(
  '--mc-file',
  path.join(MC_APP, 'src/utils/nimbus-surface.generated.ts')
);
const COMMAND = 'npm run generate:nimbus-surface (in service/)';

const versionOf = (file) => {
  if (!fs.existsSync(file)) return undefined;
  const match = /export const NIMBUS_VERSION = '([^']+)'/.exec(
    fs.readFileSync(file, 'utf8')
  );
  return match ? match[1] : undefined;
};

if (flag('--regenerate')) {
  const result = spawnSync(
    process.execPath,
    [path.join(MC_APP, 'scripts/generate-nimbus-surface.mjs')],
    { cwd: MC_APP, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    process.stderr.write(
      'mc-app generator failed (install mc-app dependencies first).\n'
    );
    process.exit(1);
  }
}

if (!fs.existsSync(mcFile)) {
  process.stderr.write(`mc-app manifest not found: ${mcFile}\n`);
  process.exit(1);
}

if (flag('--check')) {
  const mine = versionOf(serviceFile);
  const theirs = versionOf(mcFile);
  const same =
    fs.existsSync(serviceFile) &&
    fs.readFileSync(serviceFile, 'utf8') === fs.readFileSync(mcFile, 'utf8');
  if (mine !== theirs || !same) {
    process.stderr.write(
      `nimbus surface manifest is stale: service has ${mine ?? 'none'}, mc-app has ${theirs ?? 'none'}` +
        `${mine === theirs ? ' (same version, different content)' : ''}.\n` +
        `Run: ${COMMAND}\n`
    );
    process.exit(1);
  }
  process.stdout.write(
    `nimbus surface manifest is up to date (Nimbus ${mine})\n`
  );
} else {
  fs.mkdirSync(path.dirname(serviceFile), { recursive: true });
  fs.copyFileSync(mcFile, serviceFile);
  process.stdout.write(
    `wrote ${path.relative(process.cwd(), serviceFile)} (Nimbus ${versionOf(serviceFile)})\n`
  );
}
