#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Aggregates the release acceptance table (changes A to X and Z) from the repository state.
// It never marks a row as verified by itself: a verdict comes only from the hand-written evidence
// file (default plans/evidence/z/acceptance-evidence.json) and its links must exist.
//
// Usage:
//   node scripts/release/acceptance.mjs --table [--out <file>] [--copy <file>]
//   node scripts/release/acceptance.mjs --check
//   node scripts/release/acceptance.mjs --versions [<version>]
// Common option: --root <dir> (default: the repository root).
// Exit code: 0 ok, 1 findings, 2 usage.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CHANGES = [
  ['A', 'a-repo-bootstrap-labs-compliance'],
  ['B', 'b-connect-skeleton'],
  ['C', 'c-service-foundation'],
  ['D', 'd-mc-session-auth'],
  ['E', 'e-persistence-custom-objects'],
  ['F', 'f-gcp-credentials-and-vertex-llm'],
  ['G', 'g-chat-sessions-and-digest'],
  ['H', 'h-agents-and-chat-stream'],
  ['I', 'i-identity-managed-mcp'],
  ['J', 'j-third-party-tool-sources'],
  ['K', 'k-nimbus-mcp-embedded'],
  ['L', 'l-bigquery-and-gcs'],
  ['M', 'm-composed-pages'],
  ['N', 'n-feedback-and-backoffice-api'],
  ['O', 'o-frontend-foundation'],
  ['P', 'p-mc-app-chat-surface'],
  ['Q', 'q-mc-app-admin-surfaces'],
  ['R', 'r-composed-apps-app'],
  ['S', 's-mc-view-app'],
  ['U', 'u-connect-deployment-no-gha'],
  ['V', 'v-e2e-chrome-testing'],
  ['W', 'w-docs-and-readmes'],
  ['X', 'x-labs-publication-gate'],
  ['Z', 'z-release-verification'],
];

/** Changes that do not take part in v1 (shown, never required). */
export const NOT_REQUIRED = [
  ['T', 'withdrawn spec: not part of v1 (owner decision Q1)'],
  ['Y', 'reserved letter, unused by design'],
];

const PACKAGES = ['service', 'mc-app', 'composed-apps', 'mc-view-app'];
const STATUS_OK = /^(PASS|FLAKE-PASS)$/;

function listDirs(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
}

/** Archive directory names may carry a date prefix: match by suffix. */
export function findArchived(root, name) {
  const hit = listDirs(join(root, 'openspec', 'changes', 'archive')).find((d) => d === name || d.endsWith(`-${name}`));
  return hit ? `openspec/changes/archive/${hit}` : null;
}

export function findActive(root, name) {
  return existsSync(join(root, 'openspec', 'changes', name)) ? `openspec/changes/${name}` : null;
}

export function taskCounts(text) {
  const done = (text.match(/^\s*- \[[xX]\] /gm) ?? []).length;
  const open = (text.match(/^\s*- \[ \] /gm) ?? []).length;
  return { done, open };
}

/** Text of the last "Verification" section of a tasks.md (or ''). */
export function verificationSection(text) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) if (/^## .*Verification/i.test(lines[i])) start = i;
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  return lines.slice(start, end).join('\n');
}

export function extractCommands(section) {
  const out = new Set();
  for (const m of section.matchAll(/`([^`\n]+)`/g)) {
    const c = m[1].trim();
    if (/^(node|npm|yarn|commercetools|cd|openspec|bash|grep)\b/.test(c)) out.add(c);
  }
  return [...out];
}

export function extractScenarioIds(section) {
  const ids = new Set();
  for (const m of section.matchAll(/E2E-[A-Z]-\d{2}[a-z]?/g)) ids.add(m[0]);
  // ranges such as E2E-D-01..D-05 or E2E-D-01 .. E2E-D-05
  for (const m of section.matchAll(/E2E-([A-Z])-(\d{2})\s*\.\.\s*(?:E2E-)?(?:[A-Z]-)?(\d{2})/g)) {
    for (let n = Number(m[2]); n <= Number(m[3]); n++) ids.add(`E2E-${m[1]}-${String(n).padStart(2, '0')}`);
  }
  return [...ids].sort();
}

/** Newest plans/evidence/<run>/report.md (by mtime), excluding the z folder. */
export function newestReport(root) {
  const base = join(root, 'plans', 'evidence');
  let best = null;
  for (const d of listDirs(base)) {
    if (d === 'z') continue;
    const f = join(base, d, 'report.md');
    if (!existsSync(f)) continue;
    const t = statSync(f).mtimeMs;
    if (!best || t > best.t) best = { t, file: f, run: d };
  }
  return best;
}

/** Map scenario id -> status from a report.md written by scripts/e2e/report.mjs. */
export function parseReport(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    if (!/^\|\s*E2E-/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    map.set(cells[1], cells[4] ?? '');
  }
  return map;
}

export function loadEvidence(root, file) {
  const f = file ?? join(root, 'plans', 'evidence', 'z', 'acceptance-evidence.json');
  if (!existsSync(f)) return {};
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function collect(root, evidenceFile) {
  const report = newestReport(root);
  const statuses = report ? parseReport(readFileSync(report.file, 'utf8')) : new Map();
  const evidence = loadEvidence(root, evidenceFile);
  const rows = CHANGES.map(([id, name]) => {
    const archive = findArchived(root, name);
    const active = findActive(root, name);
    const tasksFile = join(root, archive ?? active ?? `openspec/changes/${name}`, 'tasks.md');
    const text = existsSync(tasksFile) ? readFileSync(tasksFile, 'utf8') : '';
    const section = verificationSection(text);
    const scenarioIds = extractScenarioIds(section);
    const ev = evidence[id] ?? {};
    const links = Array.isArray(ev.links) ? ev.links : [];
    return {
      id,
      name,
      archive,
      active,
      tasks: taskCounts(text),
      commands: extractCommands(section),
      scenarios: scenarioIds.map((s) => ({ id: s, status: statuses.get(s) ?? 'NOT RUN' })),
      links,
      missingLinks: links.filter((l) => !/^https?:\/\//.test(l) && !existsSync(join(root, l))),
      verifier: ev.verifier ?? '',
      verdict: ev.verdict ?? 'NOT VERIFIED',
      note: ev.note ?? '',
    };
  });
  return { rows, report };
}

/** Findings that make `--check` fail. */
export function findings(rows) {
  const out = [];
  for (const r of rows) {
    if (!r.archive) out.push(`${r.id} ${r.name}: not archived${r.active ? ' (still an active change)' : ' (directory not found)'}`);
    for (const s of r.scenarios) if (/^FAIL$/.test(s.status)) out.push(`${r.id}: scenario ${s.id} is FAIL`);
    for (const l of r.missingLinks) out.push(`${r.id}: evidence link does not exist: ${l}`);
    if (r.verdict === 'PASS' && (r.links.length === 0 || !r.verifier)) out.push(`${r.id}: verdict PASS needs a verifier and at least one evidence link`);
    if (r.verdict !== 'PASS') out.push(`${r.id}: verdict ${r.verdict} (no accepted evidence)`);
  }
  return out;
}

const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');

export function renderTable(rows, report) {
  const lines = [
    '# A to Z acceptance table',
    '',
    `Generated by \`node scripts/release/acceptance.mjs --table\`. Scenario statuses: ${report ? `from \`plans/evidence/${report.run}/report.md\`` : 'no E2E report exists'}; a scenario without a result is NOT RUN.`,
    'The verdict is NOT VERIFIED unless the hand-written evidence file supplies PASS with a verifier and existing links.',
    '',
    '| id | change | archived | tasks done/open | commands named in Verification | scenarios (status) | evidence links | verifier | verdict | note |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const sc = r.scenarios.length ? r.scenarios.map((s) => `${s.id}: ${s.status}`).join('; ') : 'none named';
    lines.push(
      `| ${r.id} | \`${r.name}\` | ${r.archive ? `yes (${r.archive})` : r.active ? 'NO (active change)' : 'NO'} | ${r.tasks.done}/${r.tasks.open} | ${cell(r.commands.map((c) => `\`${c}\``).join('; ') || 'none')} | ${cell(sc)} | ${cell(r.links.join(', ') || 'none')} | ${cell(r.verifier || '-')} | ${r.verdict} | ${cell(r.note || '-')} |`,
    );
  }
  for (const [id, why] of NOT_REQUIRED) lines.push(`| ${id} | - | n/a | - | - | - | - | - | NOT REQUIRED (${why}) | - |`);
  lines.push('');
  return lines.join('\n');
}

export function checkVersions(root, version) {
  const problems = [];
  for (const p of PACKAGES) {
    const f = join(root, p, 'package.json');
    if (!existsSync(f)) { problems.push(`${p}/package.json missing`); continue; }
    const v = JSON.parse(readFileSync(f, 'utf8')).version;
    if (v !== version) problems.push(`${p}/package.json version is ${v}, expected ${version}`);
  }
  const cl = join(root, 'CHANGELOG.md');
  if (!existsSync(cl)) problems.push('CHANGELOG.md missing');
  else {
    const m = readFileSync(cl, 'utf8').match(/^##\s+\[?v?([0-9][^\s\]]*)/m);
    if (!m) problems.push('CHANGELOG.md has no version heading');
    else if (m[1] !== version) problems.push(`CHANGELOG.md first heading is ${m[1]}, expected ${version}`);
  }
  return problems;
}

function opt(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

export function run(args, io = { log: console.log, err: console.error }) {
  const root = resolve(opt(args, '--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  if (args.includes('--versions')) {
    const version = opt(args, '--versions') ?? '0.1.0';
    const problems = checkVersions(root, version);
    if (problems.length) { for (const p of problems) io.err(p); return 1; }
    io.log(`OK: all four package.json files and the first CHANGELOG heading are ${version}`);
    return 0;
  }
  if (args.includes('--table') || args.includes('--check')) {
    const { rows, report } = collect(root, opt(args, '--evidence'));
    if (args.includes('--table')) {
      const text = renderTable(rows, report);
      for (const target of [opt(args, '--out') ?? join(root, 'plans', 'evidence', 'z', 'acceptance.md'), opt(args, '--copy')].filter(Boolean)) {
        mkdirSync(dirname(resolve(root, target)), { recursive: true });
        writeFileSync(resolve(root, target), text);
        io.log(`written ${target}`);
      }
      return 0;
    }
    const f = findings(rows);
    if (f.length) {
      for (const x of f) io.err(x);
      io.err(`${f.length} finding(s)`);
      return 1;
    }
    io.log(`OK: ${rows.length} changes archived and accepted`);
    return 0;
  }
  io.err('usage: acceptance.mjs --table | --check | --versions [version] [--root dir]');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
