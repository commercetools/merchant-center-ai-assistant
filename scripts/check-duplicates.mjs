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
      'mc-view-app/src/utils/forward-to.ts',
    ],
  },
  // Change S: chat parts the Custom View panel copies from mc-app and must keep identical.
  // Files that the panel prunes or adapts (chat-area, message, composer, connector, ...) are
  // deliberately not listed; they carry a "Derived from" header instead.
  ...[
    'utils/forward-to.ts',
    'utils/material-icons.ts',
    'types/chart.ts',
    'hooks/use-service-image.ts',
    'components/your-user-id/index.tsx',
    'components/new-chat/types.ts',
    'components/new-chat/layout.ts',
    'components/new-chat/agent-avatar.tsx',
    'components/new-chat/parts/json-block.tsx',
    'components/new-chat/parts/text-part.tsx',
    'components/new-chat/parts/file-part.tsx',
    'components/new-chat/parts/export-part.tsx',
    'components/new-chat/parts/reasoning-part.tsx',
    'components/new-chat/parts/source-part.tsx',
    'components/new-chat/typing-indicator/index.tsx',
    'components/new-chat/typing-indicator/use-typewriter.ts',
    'components/new-chat/typing-indicator/cute-text-phrases.ts',
    'components/new-chat/typing-indicator/cute-text-animator.tsx',
  ].map((file) => ({
    name: 'view-chat-parts',
    files: [`mc-app/src/${file}`, `mc-view-app/src/${file}`],
  })),
  // Change R: the composed-page renderer chain and its types, copied from mc-app into the
  // Pages app. ui-error-boundary, the contexts, the storage hook and the pages list query are
  // deliberately not listed: composed-apps is read-only, has no chat session and sorts and
  // paginates its own list.
  ...[
    'utils/babel-renderer.tsx',
    'components/page-renderer/index.tsx',
    'components/composed-page-chart/index.tsx',
    'types/composed-page.ts',
    'types/chart.ts',
    'utils/schema-helpers.ts',
    'hooks/use-graphql/index.ts',
    'hooks/use-composed-pages-connector/fetch-composed-page.ctp.graphql',
  ].map((file) => ({
    name: 'composed-renderer',
    files: [`mc-app/src/${file}`, `composed-apps/src/${file}`],
  })),
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
