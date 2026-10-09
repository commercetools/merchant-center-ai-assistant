#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Seeds test fixtures as Custom Objects of the scratch project (dev API client in service/.env.local).
// Usage: node scripts/e2e/seed.mjs composed-pages [--dry-run]   five `e2e-*` pages for E2E-R-*
//        node scripts/e2e/seed.mjs legacy-page [--dry-run]      `e2e-legacy` with schema 4.0 (E2E-R-09)
// composed-pages needs the built service (`cd service && npm run build`): each page is produced by the
// service's own createComposedPage, so the stored schema equals what the assistant writes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from './lib/ct-client.mjs';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURES = join(REPO, 'e2e', 'fixtures', 'composed-pages');
const CONTAINER = 'shared-composed-pages';

/** Reads and validates the fixture inputs; every key must start with `e2e-`. */
export function loadFixtures(dir = FIXTURES) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => {
      const f = JSON.parse(readFileSync(join(dir, n), 'utf8'));
      if (typeof f.key !== 'string' || !f.key.startsWith('e2e-')) throw new Error(`${n}: key must start with e2e-`);
      return f;
    });
}

/** Wraps a tool output as the stored value (same shape as service/src/composed-pages/fixture.ts). */
export function toStoredValue(fixture, output, createdBy = 'e2e-seed') {
  return { name: fixture.title, icon: 'Page', schema: output.schema, isPublished: fixture.isPublished === true, createdBy };
}

export async function run(argv, { client = null, log = console.log, createComposedPage = null } = {}) {
  const [what, ...rest] = argv;
  const dry = rest.includes('--dry-run');
  if (what !== 'composed-pages' && what !== 'legacy-page') {
    log('usage: seed.mjs composed-pages|legacy-page [--dry-run]');
    return 2;
  }
  const api = dry && !client ? null : client ?? createClient();
  if (what === 'legacy-page') {
    const value = { name: 'E2E legacy', icon: 'Page', isPublished: true, createdBy: 'e2e-seed', schema: { version: '4.0', title: 'E2E legacy', components: [] } };
    log(`${dry ? 'would write' : 'writing'} ${CONTAINER}/e2e-legacy`);
    if (api) await api.put(CONTAINER, 'e2e-legacy', value);
    return 0;
  }
  let create = createComposedPage;
  if (!create) {
    const built = join(REPO, 'service', 'build', 'composed-pages', 'tool.js');
    if (!existsSync(built)) {
      log('service build not found: run `cd service && npm run build` first');
      return 1;
    }
    create = createRequire(import.meta.url)(built).createComposedPage;
  }
  for (const f of loadFixtures()) {
    const { isPublished: _ignored, ...input } = f;
    const output = await create(input);
    if (!output.success) throw new Error(`${f.key}: ${JSON.stringify(output.errors).slice(0, 200)}`);
    log(`${dry ? 'would write' : 'writing'} ${CONTAINER}/${f.key}`);
    if (api) await api.put(CONTAINER, f.key, toStoredValue(f, output));
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`seed: ${e.message}`);
      process.exit(1);
    }
  );
}
