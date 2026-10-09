#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// SPDX header, package-name and LICENSE checker. Dependency free; no private tooling needed.
// Usage: node scripts/spdx-check.mjs [--headers] [--names] [--license]   (no flag = all three)
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, isInternal, listFiles } from './lib/files.mjs';

// mirrors the labs gate: keep in sync
export const REQUIRED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.java', '.kt', '.swift', '.css', '.scss', '.sh'];
export const GENERATED = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'schemas/', 'src/types/generated/', 'types/generated/', 'public/', 'dist/', 'build/', '.next/'];
export const SKIP_DIRS = ['node_modules', '.git', 'coverage'];

export const NAME_PATTERN = /^(@commercetools-labs\/)?ai-assistant(-[a-z0-9]+)*$/;
// package.json files allowed to be non-private (none for now)
export const PUBLIC_PACKAGE_ALLOW = [];

/** A path ending in `/` matches as substring, others as suffix. */
export function isGenerated(path) {
  return GENERATED.some((g) => (g.endsWith('/') ? `/${path}`.includes(`/${g}`) : path.endsWith(g)));
}

export function isSkippedDir(path) {
  return path.split('/').some((seg) => SKIP_DIRS.includes(seg));
}

export function requiresHeader(path) {
  return REQUIRED_EXT.includes(extname(path)) && !isGenerated(path) && !isSkippedDir(path);
}

/** True when the first 600 characters carry the three-line banner (any comment syntax, optional shebang). */
export function checkHeader(text) {
  const head = text.slice(0, 600);
  return (
    head.includes('SPDX-License-Identifier: MIT') &&
    head.includes('commercetools-labs contributors') &&
    head.includes('UNSUPPORTED')
  );
}

/** Returns a list of problems (empty when the package.json content is fine). */
export function checkName(json, path = 'package.json') {
  const problems = [];
  if (typeof json.name === 'string' && !NAME_PATTERN.test(json.name)) {
    problems.push(`BAD NAME ${path}: ${json.name} (expected ai-assistant-<suffix>)`);
  }
  if (json.private !== true && !PUBLIC_PACKAGE_ALLOW.includes(path)) {
    problems.push(`NOT PRIVATE ${path}: "private": true is required`);
  }
  return problems;
}

export function checkLicenseText(text) {
  const problems = [];
  if (!text.startsWith('MIT License')) problems.push('LICENSE must start with "MIT License"');
  if (!/Copyright \(c\) \d{4} commercetools GmbH and the commercetools-labs contributors/.test(text)) {
    problems.push('LICENSE must contain "Copyright (c) <year> commercetools GmbH and the commercetools-labs contributors"');
  }
  if (!text.includes('THE SOFTWARE IS PROVIDED "AS IS"')) problems.push('LICENSE must contain the MIT warranty disclaimer');
  return problems;
}

export function isLicenseName(path) {
  return /^(license|licence|copying)(\..*)?$/i.test(basename(path));
}

function run(flags) {
  const all = flags.length === 0;
  const files = listFiles(ROOT);
  let failures = 0;
  const fail = (line) => {
    console.log(line);
    failures += 1;
  };

  if (all || flags.includes('--headers')) {
    const before = failures;
    for (const p of files) {
      if (isInternal(p) || !requiresHeader(p)) continue;
      if (!checkHeader(readFileSync(join(ROOT, p), 'utf8'))) fail(`MISSING HEADER ${p}`);
    }
    if (failures === before) console.log('headers ok');
  }

  if (all || flags.includes('--names')) {
    const before = failures;
    for (const p of files) {
      if (basename(p) !== 'package.json' || isSkippedDir(p)) continue;
      let json;
      try {
        json = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
      } catch {
        fail(`BAD JSON ${p}`);
        continue;
      }
      for (const line of checkName(json, p)) fail(line);
    }
    if (failures === before) console.log('names ok');
  }

  if (all || flags.includes('--license')) {
    const before = failures;
    if (!files.includes('LICENSE')) fail('MISSING LICENSE');
    else for (const line of checkLicenseText(readFileSync(join(ROOT, 'LICENSE'), 'utf8'))) fail(line);
    for (const p of files) {
      if (p !== 'LICENSE' && isLicenseName(p) && !isSkippedDir(p)) fail(`NESTED LICENSE ${p}`);
    }
    if (failures === before) console.log('license ok');
  }

  console.log(failures === 0 ? 'spdx-check: ok' : `spdx-check: ${failures} failure(s)`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
