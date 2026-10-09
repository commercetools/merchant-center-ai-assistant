#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Read-only Custom Object oracle (`CO`) for the E2E cards. Never prints values: only containers,
// keys, versions, structure (types and string lengths) and occurrence counts.
// Usage: node scripts/e2e/co.mjs list [--prefix <container prefix>] [--container <name>] [--marker e2e-]
//        node scripts/e2e/co.mjs shape <container> [<key>]
//        node scripts/e2e/co.mjs grep <container> <needle> [<needle> ...]
import { pathToFileURL } from 'node:url';
import { createClient } from './lib/ct-client.mjs';
import { countNeedles, shapeOf } from './lib/e2e-objects.mjs';

export async function run(argv, { client = null, log = console.log } = {}) {
  const args = [...argv];
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const prefix = flag('--prefix');
  const container = flag('--container');
  const marker = flag('--marker');
  const [cmd, c, ...rest] = args;
  const api = client ?? createClient();
  if (cmd === 'list') {
    const where = container ? `container="${container}"` : '';
    const counts = new Map();
    for await (const o of api.all(where)) {
      if (prefix && !o.container.startsWith(prefix)) continue;
      if (marker && !(o.key.startsWith(marker) || JSON.stringify(o.value ?? null).includes(`"${marker}`))) continue;
      counts.set(o.container, (counts.get(o.container) ?? 0) + 1);
      log(`${o.container}\t${o.key}\tv${o.version}\t${o.lastModifiedAt ?? ''}`);
    }
    log(`containers: ${counts.size}, objects: ${[...counts.values()].reduce((a, b) => a + b, 0)}`);
    return 0;
  }
  if (cmd === 'shape' && c) {
    if (rest[0]) {
      const o = await api.get(c, rest[0]);
      log(o ? JSON.stringify({ container: o.container, key: o.key, version: o.version, value: shapeOf(o.value) }, null, 2) : 'absent');
      return 0;
    }
    let n = 0;
    for await (const o of api.all(`container="${c}"`)) {
      n += 1;
      if (n <= 3) log(JSON.stringify({ key: o.key, version: o.version, value: shapeOf(o.value) }, null, 2));
    }
    log(n === 0 ? 'absent' : `objects: ${n}`);
    return 0;
  }
  if (cmd === 'grep' && c && rest.length) {
    const totals = Object.fromEntries(rest.map((r) => [r, 0]));
    for await (const o of api.all(`container="${c}"`)) {
      const counts = countNeedles(o.value, rest);
      for (const [needle, count] of Object.entries(counts)) totals[needle] += count;
    }
    log(JSON.stringify({ container: c, occurrences: totals }));
    return Object.values(totals).some((v) => v > 0) ? 1 : 0;
  }
  log('usage: co.mjs list [--prefix p] [--container c] [--marker m] | shape <container> [<key>] | grep <container> <needle>...');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`co: ${e.message}`);
      process.exit(1);
    }
  );
}
