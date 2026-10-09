/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Checks the links of the published Markdown files, offline:
//   - a relative link must point to an existing file or folder;
//   - a `#anchor` must exist as a heading of the target file (GitHub slug rules);
//   - a link must not point into internal material (plans/, openspec/, .claude, CLAUDE.md,
//     file:// or an absolute local path).
// http(s) links are not fetched; `--list-external` prints them.
// Usage: node scripts/docs/check-links.mjs [--list-external] [--root <dir>] [files...]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, anchors, docFiles, parseArgs, withoutFences } from './lib.mjs';

const FORBIDDEN_TARGET = [/(^|\/)plans\//, /(^|\/)openspec\//, /\.claude/, /CLAUDE\.md/, /^file:/i, /^\/Users\//, /^\/home\//, /^[A-Za-z]:\\/];

/** Links of a Markdown text: [{ line, target }] (inline code and fenced code are ignored). */
export function extractLinks(text) {
  const out = [];
  withoutFences(text).forEach((raw, i) => {
    const line = raw.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
    for (const m of line.matchAll(/!?\[(?:[^\[\]]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      out.push({ line: i + 1, target: m[1] });
    }
    for (const m of line.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/g)) out.push({ line: i + 1, target: m[1] });
  });
  return out;
}

/** Checks one file; returns { problems: string[], external: string[] }. */
export function checkFile(root, file, readText = (p) => readFileSync(join(root, p), 'utf8')) {
  const problems = [];
  const external = [];
  const text = readText(file);
  const cache = new Map();
  const anchorsOf = (path) => {
    if (!cache.has(path)) cache.set(path, anchors(readText(path)));
    return cache.get(path);
  };
  for (const { line, target } of extractLinks(text)) {
    const where = `${file}:${line}`;
    if (FORBIDDEN_TARGET.some((re) => re.test(target))) {
      problems.push(`INTERNAL-LINK ${where} ${target}`);
      continue;
    }
    if (/^(https?:|mailto:)/i.test(target)) {
      if (/^https?:/i.test(target)) external.push(`${where} ${target}`);
      continue;
    }
    const [pathPart, fragment] = target.split('#');
    const targetPath = pathPart === '' ? file : normalize(join(dirname(file), decodeURIComponent(pathPart)));
    if (targetPath.startsWith('..')) {
      problems.push(`OUTSIDE-REPO ${where} ${target}`);
      continue;
    }
    const abs = join(root, targetPath);
    if (!existsSync(abs)) {
      problems.push(`BROKEN-LINK ${where} ${target}`);
      continue;
    }
    if (fragment && statSync(abs).isFile() && targetPath.endsWith('.md')) {
      if (!anchorsOf(targetPath).has(decodeURIComponent(fragment).toLowerCase())) {
        problems.push(`BROKEN-ANCHOR ${where} ${target}`);
      }
    }
  }
  return { problems, external };
}

/** Runs the check; returns the exit code. */
export function run(argv, log = console.log) {
  const { flags, positional } = parseArgs(argv, ['--root']);
  const root = flags.get('--root') ?? REPO_ROOT;
  const files = positional.length > 0 ? positional.map((p) => relative(root, join(root, p))) : docFiles(root);
  let failures = 0;
  const external = [];
  for (const file of files) {
    if (!existsSync(join(root, file))) {
      log(`MISSING ${file}`);
      failures += 1;
      continue;
    }
    const result = checkFile(root, file);
    for (const p of result.problems) log(p);
    failures += result.problems.length;
    external.push(...result.external);
  }
  if (flags.has('--list-external')) for (const e of external) log(`EXTERNAL ${e}`);
  log(failures === 0 ? `check-links: ok (${files.length} files)` : `check-links: ${failures} problem(s)`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
