#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Scenario id and traceability lint for the Chrome playbooks in e2e/ (change V). Dependency free.
// Usage: node scripts/e2e/extract-scenario-ids.mjs [--root <dir>] <mode> [<mode> ...]
//   --list       print every id found in openspec/changes/*/tasks.md (incl. archive) and e2e/*.md
//   --lint       cards in e2e/*.md are complete, ids unique and well formed, tools and pageId valid
//   --dangling   ids mentioned in tasks.md files without a card
//   --trace      e2e/03-traceability.md covers every KEEP/CHANGE row of plans/01-source-inventory.md
//   --tiers      e2e/02-regression-order.md lists every card in exactly one tier
//   --inventory  print the KEEP/CHANGE rows of plans/01 (skeleton for the traceability table)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ID_RE = /^E2E-[A-Z]-\d{2}[a-z]?$/;
const ID_FIND = /E2E-([A-Z])-(\d{2})([a-z]?)(?:\s*\.\.\s*(?:E2E-[A-Z]-)?(\d{2})([a-z]?))?/g;
export const REQUIRED_KEYS = ['Spec', 'Tags', 'Env', 'Budget', 'Pre', 'Steps', 'Assert', 'Cleanup', 'Evidence', 'Status'];
export const TAGS = [
  'smoke', 'regression', 'destructive', 'slow', 'negative', 'shell',
  'needs:M8', 'needs:second-user', 'needs:secrets', 'needs:service-account', 'needs:deployment',
];
export const ENVS = ['local', 'sandbox', 'both'];
export const ORACLES = ['DOM', 'NET', 'CONSOLE', 'SHELL', 'CO'];
/** Tools of the connected Chrome DevTools MCP that cards may use (read 2026-10-08). */
export const TOOLS = {
  list_pages: { pageId: false },
  new_page: { pageId: false },
  select_page: { pageId: true },
  close_page: { pageId: true },
  navigate_page: { pageId: true },
  take_snapshot: { pageId: true },
  take_screenshot: { pageId: true },
  click: { pageId: true },
  fill: { pageId: true },
  fill_form: { pageId: true },
  type_text: { pageId: true },
  press_key: { pageId: true },
  hover: { pageId: true },
  drag: { pageId: true },
  upload_file: { pageId: true },
  handle_dialog: { pageId: true },
  wait_for: { pageId: true },
  evaluate_script: { pageId: true },
  list_network_requests: { pageId: true },
  get_network_request: { pageId: true },
  list_console_messages: { pageId: true },
  get_console_message: { pageId: true },
  emulate: { pageId: true },
  resize_page: { pageId: true },
};

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// ---- helpers --------------------------------------------------------------------------------
const read = (p) => readFileSync(p, 'utf8');

/** Expands `E2E-O-01..06` and `E2E-P-01 .. E2E-P-16` ranges; returns unique ids in order. */
export function extractIds(text) {
  const out = [];
  for (const m of text.matchAll(ID_FIND)) {
    const [, spec, from, fromSuffix, to, toSuffix] = m;
    if (to === undefined) {
      out.push(`E2E-${spec}-${from}${fromSuffix}`);
      continue;
    }
    for (let n = Number(from); n <= Number(to); n += 1) {
      out.push(`E2E-${spec}-${String(n).padStart(2, '0')}${n === Number(to) ? toSuffix : ''}`);
    }
  }
  return [...new Set(out)];
}

function listFilesRec(dir, accept) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) found.push(...listFilesRec(p, accept));
    else if (accept(p)) found.push(p);
  }
  return found;
}

export function taskFiles(root) {
  return listFilesRec(join(root, 'openspec', 'changes'), (p) => basename(p) === 'tasks.md');
}

export function playbookFiles(root) {
  const dir = join(root, 'e2e');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^[A-Z]-.*\.md$/.test(n))
    .sort()
    .map((n) => join(dir, n));
}

// ---- cards ----------------------------------------------------------------------------------
const HEADING = /^### (E2E-[A-Z]-\d{2}[a-z]?) - (.+)$/;

/** Parses the cards of one playbook: [{id, title, line, file, keys: Map, body}]. */
export function parseCards(text, file = 'playbook.md') {
  const lines = text.split('\n');
  const cards = [];
  let current = null;
  let inFence = false;
  lines.forEach((line, i) => {
    if (line.startsWith('```')) inFence = !inFence;
    const h = !inFence && line.startsWith('### E2E-') ? line.match(HEADING) : null;
    if (!inFence && line.startsWith('### E2E-') && !h) {
      cards.push({ id: line.slice(4).split(' ')[0], title: '', line: i + 1, file, keys: new Map(), body: [], malformed: true });
      current = cards[cards.length - 1];
      return;
    }
    if (!inFence && (h || /^#{1,3} /.test(line))) {
      current = h ? { id: h[1], title: h[2], line: i + 1, file, keys: new Map(), body: [] } : null;
      if (current) cards.push(current);
      return;
    }
    if (!current) return;
    current.body.push({ text: line, line: i + 1 });
    const k = line.match(/^- ([A-Za-z]+):(.*)$/);
    if (k && !inFence) current.keys.set(k[1], (k[2] ?? '').trim());
  });
  return cards;
}

export function loadCards(root) {
  return playbookFiles(root).flatMap((f) => parseCards(read(f), f));
}

/** Returns a list of problem strings for the cards of one playbook file. */
export function lintCards(cards, seen = new Set()) {
  const problems = [];
  for (const c of cards) {
    const where = `${basename(c.file)}:${c.line} ${c.id}`;
    if (c.malformed) {
      problems.push(`${where}: heading must be "### E2E-<S>-<nn> - <title>"`);
      continue;
    }
    if (!ID_RE.test(c.id)) problems.push(`${where}: id does not match ${ID_RE}`);
    if (seen.has(c.id)) problems.push(`${where}: duplicate id`);
    seen.add(c.id);
    const fileLetter = basename(c.file)[0];
    if (c.id[4] !== fileLetter) problems.push(`${where}: id letter ${c.id[4]} does not match file ${basename(c.file)}`);
    for (const key of REQUIRED_KEYS) {
      if (!c.keys.has(key)) problems.push(`${where}: missing "- ${key}:"`);
    }
    const status = c.keys.get('Status');
    if (status !== undefined && !/^(NOT RUN|PASS|FAIL|SKIPPED\(.+\)|BLOCKED\(.+\)|FLAKE-PASS)$/.test(status)) {
      problems.push(`${where}: Status "${status}" is not NOT RUN, PASS, FAIL, SKIPPED(reason), BLOCKED(reason) or FLAKE-PASS`);
    }
    const env = c.keys.get('Env');
    if (env !== undefined && !ENVS.includes(env.split(' ')[0])) problems.push(`${where}: Env must start with local, sandbox or both`);
    const tags = c.keys.get('Tags');
    if (tags !== undefined) {
      for (const t of tags.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!TAGS.includes(t)) problems.push(`${where}: unknown tag "${t}"`);
      }
    }
    const budget = c.keys.get('Budget');
    if (budget !== undefined && !/^\d+( s)?\b/.test(budget)) problems.push(`${where}: Budget must start with a number of seconds`);
    const text = c.body.map((b) => b.text);
    const stepsAt = text.findIndex((t) => /^- Steps:/.test(t));
    const assertAt = text.findIndex((t) => /^- Assert:/.test(t));
    const cleanupAt = text.findIndex((t) => /^- Cleanup:/.test(t));
    if (stepsAt >= 0 && assertAt > stepsAt) {
      const steps = text.slice(stepsAt + 1, assertAt).filter((t) => /^\s+\d+\.\s/.test(t));
      if (steps.length === 0) problems.push(`${where}: Steps has no numbered step`);
      for (const s of text.slice(stepsAt + 1, assertAt)) {
        for (const tm of s.matchAll(/mcp__chrome-devtools__([a-z_]+)/g)) {
          const tool = TOOLS[tm[1]];
          if (!tool) problems.push(`${where}: unknown tool mcp__chrome-devtools__${tm[1]}`);
          else if (tool.pageId && !/pageId\s*:/.test(s)) problems.push(`${where}: tool ${tm[1]} without pageId: "${s.trim().slice(0, 70)}"`);
        }
      }
    }
    if (assertAt >= 0) {
      const end = cleanupAt > assertAt ? cleanupAt : text.length;
      const asserts = text.slice(assertAt + 1, end).filter((t) => /^\s+A\d+\s/.test(t));
      if (asserts.length === 0) problems.push(`${where}: Assert has no numbered assertion "A1 [ORACLE] ..."`);
      for (const a of asserts) {
        const o = a.match(/\[([A-Z]+)\]/);
        if (!o || !ORACLES.includes(o[1])) problems.push(`${where}: assertion without oracle tag ${ORACLES.join('|')}: "${a.trim().slice(0, 60)}"`);
      }
    }
  }
  return problems;
}

// ---- inventory and traceability -------------------------------------------------------------
/** Splits a markdown table row on `|` outside backticks. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let tick = false;
  for (const ch of line.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** KEEP and CHANGE rows of every table with a "Verdict" column in plans/01. */
export function inventoryRows(text) {
  const rows = [];
  let verdictCol = -1;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      verdictCol = -1;
      continue;
    }
    const cells = splitRow(line);
    if (cells.every((c) => /^-+$/.test(c))) continue;
    const header = cells.findIndex((c) => c === 'Verdict');
    if (header >= 0) {
      verdictCol = header;
      continue;
    }
    if (verdictCol < 0) continue;
    const verdict = cells[verdictCol] ?? '';
    if (/^(KEEP|CHANGE)/.test(verdict)) rows.push({ feature: cells[0], verdict });
  }
  return rows;
}

/** Parses the table rows of e2e/03-traceability.md: [{n, feature, owner, ids}]. */
export function traceRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < 4 || !/^(\d+|X\d+)$/.test(cells[0])) continue;
    const extra = cells[0].startsWith('X');
    rows.push({ n: extra ? cells[0] : Number(cells[0]), extra, feature: cells[1], owner: cells[2], ids: extractIds(cells[3]) });
  }
  return rows;
}

export function traceProblems(inventory, trace, cardIds) {
  const problems = [];
  trace.forEach((r) => {
    if (r.ids.length === 0) problems.push(`trace row ${r.n} (${r.feature.slice(0, 40)}): no scenario id`);
    for (const id of r.ids) if (!cardIds.has(id)) problems.push(`trace row ${r.n}: ${id} has no card`);
  });
  const mapped = trace.filter((r) => !r.extra);
  if (mapped.length !== inventory.length) {
    problems.push(`trace has ${mapped.length} rows, plans/01 has ${inventory.length} KEEP/CHANGE rows`);
  }
  const traced = new Set(mapped.map((r) => r.feature));
  for (const row of inventory) {
    if (!traced.has(row.feature)) problems.push(`plans/01 row not in the trace table: ${row.feature.slice(0, 70)}`);
  }
  return problems;
}

// ---- tiers ----------------------------------------------------------------------------------
/** Splits e2e/02-regression-order.md into tiers: [{name, ids}]. */
export function parseTiers(text) {
  const tiers = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^## (Tier \d+\b.*)$/);
    if (h) {
      cur = { name: h[1], ids: [] };
      tiers.push(cur);
    } else if (/^## /.test(line)) cur = null;
    else if (cur) cur.ids.push(...extractIds(line));
  }
  return tiers.map((t) => ({ ...t, ids: [...t.ids] }));
}

export function tierProblems(tiers, cardIds) {
  const problems = [];
  const where = new Map();
  for (const t of tiers) {
    for (const id of t.ids) {
      if (!cardIds.has(id)) problems.push(`${t.name}: ${id} has no card`);
      if (where.has(id) && where.get(id) !== t.name) problems.push(`${id} is in two tiers: ${where.get(id)} and ${t.name}`);
      where.set(id, t.name);
    }
  }
  for (const id of cardIds) if (!where.has(id)) problems.push(`${id} is in no tier`);
  return problems;
}

// ---- main -----------------------------------------------------------------------------------
export function run(argv, log = console.log, err = console.error) {
  const args = [...argv];
  let root = REPO;
  const ri = args.indexOf('--root');
  if (ri >= 0) {
    root = resolve(args[ri + 1]);
    args.splice(ri, 2);
  }
  const modes = args.filter((a) => a.startsWith('--'));
  if (modes.length === 0) {
    err('usage: extract-scenario-ids.mjs [--root dir] --list|--lint|--dangling|--trace|--tiers|--inventory');
    return 2;
  }
  let failed = false;
  const fail = (title, problems) => {
    if (problems.length === 0) return;
    failed = true;
    err(`${title}: ${problems.length} problem(s)`);
    problems.forEach((p) => err(`  ${p}`));
  };
  const cards = loadCards(root);
  const cardIds = new Set(cards.map((c) => c.id));
  const taskIds = new Map();
  for (const f of taskFiles(root)) {
    for (const id of extractIds(read(f))) taskIds.set(id, [...(taskIds.get(id) ?? []), f.slice(root.length + 1)]);
  }
  for (const mode of modes) {
    if (mode === '--list') {
      const all = new Set([...taskIds.keys(), ...cardIds]);
      [...all].sort().forEach((id) => log(`${id}${cardIds.has(id) ? '' : '  (no card)'}`));
    } else if (mode === '--lint') {
      const seen = new Set();
      const problems = [];
      for (const f of playbookFiles(root)) problems.push(...lintCards(cards.filter((c) => c.file === f), seen));
      fail('lint', problems);
      if (!problems.length) log(`lint ok (${cards.length} cards in ${playbookFiles(root).length} playbooks)`);
    } else if (mode === '--dangling') {
      const dangling = [...taskIds.keys()].filter((id) => !cardIds.has(id)).sort();
      fail('dangling', dangling.map((id) => `${id} (in ${taskIds.get(id)[0]}) has no card`));
      if (!dangling.length) log(`dangling ok (${taskIds.size} ids in tasks, all have a card)`);
    } else if (mode === '--trace' || mode === '--inventory') {
      const inv = inventoryRows(read(join(root, 'plans', '01-source-inventory.md')));
      if (mode === '--inventory') {
        inv.forEach((r, i) => log(`| ${i + 1} | ${r.feature} |`));
        continue;
      }
      const tf = join(root, 'e2e', '03-traceability.md');
      if (!existsSync(tf)) {
        fail('trace', ['e2e/03-traceability.md is missing']);
        continue;
      }
      const trace = traceRows(read(tf));
      const problems = traceProblems(inv, trace, cardIds);
      fail('trace', problems);
      if (!problems.length) log(`trace ok (${trace.filter((r) => !r.extra).length} mapped features = ${inv.length} KEEP/CHANGE rows, ${trace.filter((r) => r.extra).length} extra requirements)`);
    } else if (mode === '--tiers') {
      const tf = join(root, 'e2e', '02-regression-order.md');
      if (!existsSync(tf)) {
        fail('tiers', ['e2e/02-regression-order.md is missing']);
        continue;
      }
      const problems = tierProblems(parseTiers(read(tf)), cardIds);
      fail('tiers', problems);
      if (!problems.length) log(`tiers ok (${cardIds.size} cards, each in exactly one tier)`);
    } else {
      err(`unknown mode ${mode}`);
      return 2;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
