/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Drift guard for files that are deliberately copied into several apps. Each app is built
// on its own by Connect, so a shared folder outside the app is not in the build context.
// Later changes (R, S) append their groups (for example schema-helpers.ts) to GROUPS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GROUPS = [
  {
    name: 'forward-to',
    files: [
      'mc-app/src/utils/forward-to.ts',
      'composed-apps/src/utils/forward-to.ts',
      'mc-view-app/src/utils/forward-to.ts',
    ],
  },
];

let failed = false;
for (const group of GROUPS) {
  const [first, ...rest] = group.files;
  const firstPath = path.join(ROOT, first);
  if (!fs.existsSync(firstPath)) {
    process.stdout.write(`MISSING ${group.name}: ${first}\n`);
    failed = true;
    continue;
  }
  const reference = fs.readFileSync(firstPath);
  for (const file of rest) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) {
      process.stdout.write(`MISSING ${group.name}: ${file}\n`);
      failed = true;
    } else if (!reference.equals(fs.readFileSync(filePath))) {
      process.stdout.write(
        `DRIFT ${group.name}: ${file} differs from ${first}\n  fix: cp ${first} ${file}\n`
      );
      failed = true;
    }
  }
}

if (failed) process.exit(1);
process.stdout.write(`OK duplicates (${GROUPS.length} groups)\n`);
