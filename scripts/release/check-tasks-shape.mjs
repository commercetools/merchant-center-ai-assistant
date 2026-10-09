#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Checks the SHAPE (headings and labels, not the quality) of every tasks.md so that a junior developer
// can pick up any change: a "Read first" section, a setup section, tasks with Why / Where / How /
// Done when / Watch out, a Verification section and a "Docs to update" section.
//
// Usage: node scripts/release/check-tasks-shape.mjs [--root <dir>] [--quiet] [<tasks.md> ...]
// Without files it checks openspec/changes/archive/*/tasks.md and openspec/changes/*/tasks.md.
// Exit code: 0 no errors (warnings allowed), 1 errors, 2 usage.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LABELS = ['Why', 'Where', 'How', 'Done when', 'Watch out'];
const TASK_RE = /^- \[[ xX]\] (\d+\.\d+[a-z]?)\b/;
const SHARED_RE = /shared\s+(where|how|done|watch)/i;

/** True when the label appears as `**Why:**`, `Why:` or `**Why**:` in the task block. */
export function hasLabel(block, label) {
  const l = label.replace(/ /g, '\\s+');
  const bold = new RegExp(`\\*\\*${l}(?::\\*\\*|\\*\\*\\s*:)`, 'i'); // anywhere in the block (inline tasks)
  const plain = new RegExp(`(^|\\n)\\s*(?:[-*]\\s+)?${l}\\s*:`, 'i'); // at the start of a line
  return bold.test(block) || plain.test(block);
}

export function checkText(text) {
  const errors = [];
  const warnings = [];
  const lines = text.split('\n');
  const headings = lines.map((l, i) => ({ l, i })).filter((x) => /^## /.test(x.l));
  const has = (re) => headings.some((h) => re.test(h.l));
  if (!has(/^## (0\.|Read first)/i)) errors.push('missing "Read first" (or "0.") section');
  if (!has(/^## .*Setup/i) && !/\bSetup\b/.test(text)) errors.push('missing setup section');
  if (!has(/^## .*Verification/i)) errors.push('missing Verification section');
  if (!has(/^## .*Docs to update/i)) errors.push('missing "Docs to update" section');

  // Split into task blocks; remember the section each task lives in.
  const tasks = [];
  let section = '';
  let current = null;
  for (const line of lines) {
    if (/^## /.test(line)) { section = line; current = null; continue; }
    const m = TASK_RE.exec(line);
    if (m) { current = { id: m[1], section, body: [line] }; tasks.push(current); continue; }
    if (current) current.body.push(line);
  }
  if (tasks.length === 0) errors.push('no task bullets ("- [ ] N.N") found');
  for (const t of tasks) {
    const block = t.body.join('\n');
    const missing = LABELS.filter((l) => !hasLabel(block, l));
    if (missing.length === 0) continue;
    const exempt = /^## (0\.|Read first|1\.|.*Setup)/i.test(t.section);
    // A compressed task is one single line (no label lines below it): reported as a warning.
    const compressed = t.body.filter((l) => l.trim() !== '').length === 1;
    if (SHARED_RE.test(block) || exempt || compressed) warnings.push(`task ${t.id}: no ${missing.join(', ')}${exempt ? ' (read-first/setup task)' : compressed ? ' (compressed single-line task)' : ' (marked shared)'}`);
    else errors.push(`task ${t.id}: missing ${missing.join(', ')}`);
  }
  return { errors, warnings, tasks: tasks.length };
}

export function findTaskFiles(root) {
  const base = join(root, 'openspec', 'changes');
  const out = [];
  if (!existsSync(base)) return out;
  const archive = join(base, 'archive');
  if (existsSync(archive)) {
    for (const d of readdirSync(archive, { withFileTypes: true })) {
      if (d.isDirectory() && existsSync(join(archive, d.name, 'tasks.md'))) out.push(join(archive, d.name, 'tasks.md'));
    }
  }
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (d.isDirectory() && d.name !== 'archive' && existsSync(join(base, d.name, 'tasks.md'))) out.push(join(base, d.name, 'tasks.md'));
  }
  return out;
}

export function run(args, io = { log: console.log, err: console.error }) {
  const ri = args.indexOf('--root');
  const root = resolve(ri >= 0 ? args[ri + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const quiet = args.includes('--quiet');
  const given = args.filter((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1));
  const files = given.length ? given.map((f) => resolve(f)) : findTaskFiles(root);
  if (files.length === 0) { io.err('no tasks.md files found'); return 2; }
  let tasks = 0;
  let errors = 0;
  let warnings = 0;
  for (const f of files) {
    const r = checkText(readFileSync(f, 'utf8'));
    tasks += r.tasks;
    errors += r.errors.length;
    warnings += r.warnings.length;
    const name = relative(root, f);
    for (const e of r.errors) io.err(`ERROR ${name}: ${e}`);
    if (!quiet) for (const w of r.warnings) io.log(`warn  ${name}: ${w}`);
  }
  io.log(`checked ${files.length} files, ${tasks} tasks, ${errors} errors, ${warnings} warnings`);
  return errors > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
