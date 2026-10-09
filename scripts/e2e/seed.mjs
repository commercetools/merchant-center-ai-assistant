#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Seeds test fixtures as Custom Objects of the scratch project (dev API client in service/.env.local).
// Usage: node scripts/e2e/seed.mjs composed-pages [--dry-run]   five `e2e-*` pages for E2E-R-*
//        node scripts/e2e/seed.mjs legacy-page [--dry-run]      `e2e-legacy` with schema 4.0 (E2E-R-09)
//        node scripts/e2e/seed.mjs sessions-many --user-id <id> [--count N] [--dry-run]
//                                                               N `e2e-` sessions of one user (list cap, paging)
//        node scripts/e2e/seed.mjs large-snapshot [--out <dir>] [--user-id <id>] [--dry-run]
//                                                               feedback payload files of about 6 and 11 MiB
//                                                               (E2E-N-02); with --user-id also a session
// composed-pages needs the built service (`cd service && npm run build`): each page is produced by the
// service's own createComposedPage, so the stored schema equals what the assistant writes.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from './lib/ct-client.mjs';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURES = join(REPO, 'e2e', 'fixtures', 'composed-pages');
const CONTAINER = 'shared-composed-pages';
const SEEDS = join(REPO, 'e2e', 'fixtures', 'seeds');

/** Reads one seed definition from e2e/fixtures/seeds. */
export function loadSeed(name, dir = SEEDS) {
  return JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Session records (value shape of the service's session store) for the sessions-many seed. */
export function buildSessions(count, userId, def = loadSeed('sessions-many'), now = Date.now()) {
  if (!Number.isInteger(count) || count < 1 || count > def.maxCount) throw new Error(`--count must be 1..${def.maxCount}`);
  if (!SAFE_ID.test(userId ?? '')) throw new Error('--user-id is required and must be a plain id');
  return Array.from({ length: count }, (_v, i) => {
    const n = String(i + 1).padStart(4, '0');
    const at = now - (count - i) * 1000;
    return {
      container: def.container,
      key: `${def.keyPrefix}${n}`,
      value: { id: `${def.keyPrefix}${n}`, userId, title: `${def.titlePrefix}${n}`, createdAt: at, updatedAt: at, schemaVersion: 1 },
    };
  });
}

/**
 * Body of a POST feedback/submit request whose JSON is about `bytes` long: messages of
 * `def.messageBytes` characters of filler, no real content.
 */
export function buildSnapshotBody(sessionId, bytes, def = loadSeed('large-snapshot')) {
  if (!Number.isInteger(bytes) || bytes < 1024) throw new Error('size must be an integer of at least 1024 bytes');
  const messages = [];
  let left = bytes;
  for (let i = 0; left > 0; i++) {
    const n = Math.min(def.messageBytes, left);
    messages.push({ id: `e2e-big-${i}`, role: i % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text: 'x'.repeat(n) }] });
    left -= n;
  }
  return { sessionId, comment: def.comment, messages };
}

function option(rest, name) {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

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
  if (!['composed-pages', 'legacy-page', 'sessions-many', 'large-snapshot'].includes(what)) {
    log('usage: seed.mjs composed-pages|legacy-page|sessions-many|large-snapshot [options] [--dry-run]');
    return 2;
  }
  if (what === 'sessions-many') {
    const def = loadSeed('sessions-many');
    const userId = option(rest, '--user-id') ?? process.env.E2E_USER_ID;
    const count = Number(option(rest, '--count') ?? def.defaultCount);
    let rows;
    try {
      rows = buildSessions(count, userId, def);
    } catch (e) {
      log(`seed: ${e.message}`);
      return 2;
    }
    const api = dry && !client ? null : client ?? createClient();
    for (const r of rows) if (api) await api.put(r.container, r.key, r.value);
    log(`${dry ? 'would write' : 'wrote'} ${rows.length} sessions in ${def.container} (${rows[0].key} .. ${rows[rows.length - 1].key})`);
    return 0;
  }
  if (what === 'large-snapshot') {
    const def = loadSeed('large-snapshot');
    const userId = option(rest, '--user-id') ?? process.env.E2E_USER_ID;
    const dir = resolve(option(rest, '--out') ?? join(process.env.TMPDIR || tmpdir(), 'e2e', 'seeds'));
    mkdirSync(dir, { recursive: true });
    for (const [label, bytes] of Object.entries(def.sizes)) {
      const file = join(dir, `large-snapshot-${label}.json`);
      writeFileSync(file, JSON.stringify(buildSnapshotBody(def.sessionKey, bytes, def)));
      log(`wrote ${file} (${label}, about ${(bytes / 1048576).toFixed(0)} MiB)`);
    }
    if (userId) {
      if (!SAFE_ID.test(userId)) {
        log('seed: --user-id must be a plain id');
        return 2;
      }
      const now = Date.now();
      const value = { id: def.sessionKey, userId, title: def.comment, createdAt: now, updatedAt: now, schemaVersion: 1 };
      const api = dry && !client ? null : client ?? createClient();
      log(`${dry ? 'would write' : 'writing'} ai-assistant-sessions/${def.sessionKey}`);
      if (api) await api.put('ai-assistant-sessions', def.sessionKey, value);
    }
    return 0;
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
