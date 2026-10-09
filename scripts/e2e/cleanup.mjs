#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Removes what an E2E run created. Idempotent; only touches objects that carry the `e2e-` marker.
// Usage: node scripts/e2e/cleanup.mjs --run <run-id> [--dry-run]
//        node scripts/e2e/cleanup.mjs --sweep [--max-age-hours 24] [--dry-run]
// Needs the scratch project's dev API client in service/.env.local (manual step M3).
// Deleting through the service API (which exercises the delete paths) is done by the cards in the
// browser; this script is the fallback and the orphan sweep and never uses a user token.
import { pathToFileURL } from 'node:url';
import { createClient } from './lib/ct-client.mjs';
import { CONTAINER_PREFIX, isE2eObject, isOlderThan, isProtectedContainer, isSweepContainer } from './lib/e2e-objects.mjs';
import { readEntries } from './ledger.mjs';

/** Objects to delete for ledger entries; a session also takes its message container with it. */
export function ledgerTargets(entries) {
  const out = [];
  for (const e of entries) {
    if (e.kind === 'session') out.push({ container: `${CONTAINER_PREFIX}sessions`, key: e.id, messages: `${CONTAINER_PREFIX}messages-${e.id}` });
    else if (e.kind === 'page') out.push({ container: 'shared-composed-pages', key: e.id });
    else if (e.kind === 'feedback') out.push({ container: `${CONTAINER_PREFIX}feedback`, key: e.id });
    else if (e.kind === 'object' && e.container) out.push({ container: e.container, key: e.id });
  }
  return out;
}

export async function run(argv, { client = null, log = console.log } = {}) {
  const args = [...argv];
  const has = (n) => args.includes(n);
  const val = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const dry = has('--dry-run');
  const api = client ?? createClient();
  let deleted = 0;
  const del = async (container, key, why) => {
    if (!isSweepContainer(container) || isProtectedContainer(container) || !(key.startsWith('e2e-') || why === 'ledger' || why === 'marker')) {
      log(`skip ${container}/${key}: not an E2E object`);
      return;
    }
    if (dry) log(`would delete ${container}/${key}`);
    else {
      const gone = await api.remove(container, key);
      if (gone !== null) deleted += 1;
    }
  };
  if (has('--run')) {
    for (const t of ledgerTargets(readEntries(val('--run')))) {
      // ledger entries are explicit ids the run recorded itself, so the `e2e-` key rule does not apply
      await del(t.container, t.key, 'ledger');
      if (t.messages) {
        for await (const o of api.all(`container="${t.messages}"`)) await del(o.container, o.key, 'ledger');
      }
    }
  } else if (has('--sweep')) {
    const maxAge = Number(val('--max-age-hours') ?? 24);
    for await (const o of api.all()) {
      if (!isSweepContainer(o.container)) continue;
      if (!isE2eObject(o.container, o.key, o.value)) continue;
      if (!isOlderThan(o, maxAge)) continue;
      await del(o.container, o.key, 'marker');
      if (o.container === `${CONTAINER_PREFIX}sessions`) {
        for await (const m of api.all(`container="${CONTAINER_PREFIX}messages-${o.key}"`)) await del(m.container, m.key, 'marker');
      }
    }
  } else {
    log('usage: cleanup.mjs --run <run-id> | --sweep [--max-age-hours 24]  [--dry-run]');
    return 2;
  }
  log(`deleted: ${deleted}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`cleanup: ${e.message}`);
      process.exit(1);
    }
  );
}
