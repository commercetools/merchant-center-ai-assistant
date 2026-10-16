/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Regenerates `service/contract/composed-page.fixture.json` and the copies kept by mc-app and
 * composed-apps from the built service
 * (run `npm run build` first; `npm run update:composed-page-fixture` does both).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { buildComposedPageFixtureJson } = require(
  path.join(HERE, '../build/composed-pages/fixture.js')
);

const json = await buildComposedPageFixtureJson();
const outputs = [
  '../contract/composed-page.fixture.json',
  '../../mc-app/src/utils/composed-page.fixture.json',
  '../../composed-apps/src/hooks/use-composed-pages-storage/composed-page.fixture.json',
].map((p) => path.resolve(HERE, p));
for (const out of outputs) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json);
  process.stdout.write(`wrote ${path.relative(process.cwd(), out)}\n`);
}
