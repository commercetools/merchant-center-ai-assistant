#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Ledger of everything an E2E run created, one JSON line per entry, so cleanup.mjs can remove it.
// Usage: node scripts/e2e/ledger.mjs add <kind> <id> [--container c] [--run <run-id>]
//        node scripts/e2e/ledger.mjs list [--run <run-id>]
//        node scripts/e2e/ledger.mjs clear [--run <run-id>]
// The run id defaults to $E2E_RUN. Kinds: session, object, feedback, page.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const KINDS = ['session', 'object', 'feedback', 'page'];
const SAFE = /^[A-Za-z0-9_.:-]{1,200}$/;

export const evidenceRoot = () => process.env.E2E_EVIDENCE_ROOT || join(REPO, 'plans', 'evidence');

export function ledgerPath(run, root = evidenceRoot()) {
  if (!SAFE.test(run ?? '')) throw new Error('run id is missing or has unsafe characters');
  return join(root, run, 'ledger.jsonl');
}

export function addEntry(run, entry, root = evidenceRoot()) {
  if (!KINDS.includes(entry.kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`);
  if (!SAFE.test(entry.id ?? '')) throw new Error('id is missing or has unsafe characters');
  const file = ledgerPath(run, root);
  mkdirSync(join(root, run), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`);
}

export function readEntries(run, root = evidenceRoot()) {
  const file = ledgerPath(run, root);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function clearEntries(run, root = evidenceRoot()) {
  rmSync(ledgerPath(run, root), { force: true });
}

export function main(argv, log = console.log) {
  const args = [...argv];
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const run = flag('--run') ?? process.env.E2E_RUN;
  const container = flag('--container');
  const [cmd, kind, id] = args;
  if (cmd === 'add') {
    addEntry(run, { kind, id, ...(container ? { container } : {}) });
    log(`ledger: added ${kind} ${id}`);
  } else if (cmd === 'list') {
    readEntries(run).forEach((e) => log(`${e.kind}\t${e.container ?? ''}\t${e.id}`));
  } else if (cmd === 'clear') {
    clearEntries(run);
    log('ledger: cleared');
  } else {
    log('usage: ledger.mjs add <kind> <id> [--container c] | list | clear  [--run <run-id>]');
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`ledger: ${e.message}`);
    process.exit(2);
  }
}
