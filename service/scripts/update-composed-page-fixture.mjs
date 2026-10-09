/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Regenerates `contract/composed-page.fixture.json` from the built service
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

const out = path.resolve(HERE, '../../contract/composed-page.fixture.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await buildComposedPageFixtureJson());
process.stdout.write(`wrote ${path.relative(process.cwd(), out)}\n`);
