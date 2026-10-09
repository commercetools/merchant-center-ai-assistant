/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Scans the three frontends for leftovers from the multitenant source repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['mc-app', 'composed-apps', 'mc-view-app'];
const SKIP_DIRS = new Set(['node_modules', 'public', 'dist', 'build']);
const SKIP_FILES = new Set(['yarn.lock', 'package-lock.json']);

const PATTERNS = [
  /tenant/i,
  /x-mc-team-id/i,
  /ngrok/i,
  /run\.app/,
  /console\.(log|warn|error|info)/,
  /use-mc-teams/,
  /multiplatform/i,
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (!SKIP_FILES.has(entry.name) && !entry.name.endsWith('.md')) {
      yield path.join(dir, entry.name);
    }
  }
}

let hits = 0;
for (const app of APPS) {
  const dir = path.join(ROOT, app);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (PATTERNS.some((pattern) => pattern.test(line))) {
        hits += 1;
        process.stdout.write(
          `${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}\n`
        );
      }
    });
  }
}

if (hits > 0) {
  process.stdout.write(`${hits} leftover match(es)\n`);
  process.exit(1);
}
process.stdout.write('OK no frontend leftovers\n');
