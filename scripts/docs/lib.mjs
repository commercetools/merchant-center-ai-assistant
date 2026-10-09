/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Shared helpers of the documentation checks: repository root, the list of published
// Markdown files and a few small Markdown readers. Dependency free.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'build', 'public']);

function walk(root, rel, out) {
  const dir = join(root, rel);
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, path, out);
    else if (entry.name.endsWith('.md')) out.push(path);
  }
}

/** The user-facing Markdown files: root documents, per-app READMEs and everything in docs/. */
export function docFiles(root = REPO_ROOT) {
  const out = [];
  for (const name of ['README.md', 'SUPPORT.md', 'CONTRIBUTING.md', 'FEATURES.md', 'CHANGELOG.md']) {
    if (existsSync(join(root, name))) out.push(name);
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    if (['docs', 'plans', 'openspec', 'scripts', 'contract'].includes(entry.name)) continue;
    if (existsSync(join(root, entry.name, 'README.md'))) out.push(`${entry.name}/README.md`);
  }
  walk(root, 'docs', out);
  return [...new Set(out)].sort();
}

export const read = (root, path) => readFileSync(join(root, path), 'utf8');

/** Lines of a Markdown text with fenced code blocks blanked out (line numbers are kept). */
export function withoutFences(text) {
  let fenced = false;
  return text.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

/** Headings (level, text, line) outside code fences. */
export function headings(text) {
  const out = [];
  withoutFences(text).forEach((line, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i + 1 });
  });
  return out;
}

/** GitHub-style anchor of a heading text. */
export function slugify(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** All anchors of a Markdown text, with GitHub's -1, -2 suffixes for repeated headings. */
export function anchors(text) {
  const seen = new Map();
  const out = new Set();
  for (const h of headings(text)) {
    const base = slugify(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

/** Text of the section that starts at the heading `title` (up to the next heading of the same or a higher level). */
export function section(text, title) {
  const lines = text.split('\n');
  const hs = headings(text);
  const idx = hs.findIndex((h) => h.text.replace(/`/g, '').toLowerCase() === title.toLowerCase());
  if (idx === -1) return undefined;
  const start = hs[idx];
  const next = hs.slice(idx + 1).find((h) => h.level <= start.level);
  return lines.slice(start.line, next ? next.line - 1 : lines.length).join('\n');
}

/** Number of Markdown table data rows (rows after a separator line) in a text. */
export function tableRows(text) {
  let rows = 0;
  let inTable = false;
  for (const line of text.split('\n')) {
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\s*\|/.test(line)) rows += 1;
    else inTable = false;
  }
  return rows;
}

/** Parses `--flag [value]` style arguments into { flags: Map, positional: string[] }. */
export function parseArgs(argv, withValue = []) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (withValue.includes(a)) {
        flags.set(a, argv[i + 1]);
        i += 1;
      } else flags.set(a, true);
    } else positional.push(a);
  }
  return { flags, positional };
}
