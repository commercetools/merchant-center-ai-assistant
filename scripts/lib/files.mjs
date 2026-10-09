/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Shared helpers for the repository checkers: file list and internal-path registry.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const WALK_SKIP = new Set(['node_modules', '.git', 'coverage']);

function walk(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (WALK_SKIP.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(dir, rel));
    else out.push(rel);
  }
  return out;
}

/** Tracked files plus untracked files that are not ignored (what a later add-all would take). */
export function listFiles(root = ROOT) {
  let names;
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    names = out.split('\n').filter(Boolean);
  } catch {
    names = walk(root);
  }
  // a tracked file may be deleted in the working tree
  return [...new Set(names)].filter((p) => existsSync(join(root, p))).sort();
}

/** Paths that exist for development only. Empty when the registry is absent (state after publication). */
export function internalPaths(root = ROOT) {
  const file = join(root, 'scripts', 'internal-paths.json');
  if (!existsSync(file)) return [];
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(json.paths) ? json.paths : [];
}

/** Prefix match for entries ending in `/`, equality otherwise. */
export function isInternal(path, paths = internalPaths()) {
  return paths.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}
