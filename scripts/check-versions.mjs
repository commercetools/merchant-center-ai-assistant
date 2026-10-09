/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Fails when the frontends do not all use the same @commercetools-frontend/* version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['mc-app', 'composed-apps', 'mc-view-app'];
const PREFIX = '@commercetools-frontend/';

const found = [];
for (const app of APPS) {
  const file = path.join(app, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(pkg[section] ?? {})) {
      if (name.startsWith(PREFIX)) found.push({ file, name, version });
    }
  }
}

const versions = new Set(found.map((entry) => entry.version));
if (versions.size !== 1) {
  for (const entry of found) {
    process.stdout.write(`${entry.file} ${entry.name} ${entry.version}\n`);
  }
  process.stdout.write(`DRIFT: ${versions.size} distinct versions\n`);
  process.exit(1);
}
process.stdout.write(`OK ${[...versions][0]}\n`);
