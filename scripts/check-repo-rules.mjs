#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Repository rules checker: no CI/container/IaC files, forbidden files, .env.example policy,
// notice files, prose hygiene and (optionally) docs hygiene. Dependency free.
// Usage: node scripts/check-repo-rules.mjs [--prose] [--docs [--strict]]
//   no flag      file shape, env policy, notices, prose
//   --prose      prose only
//   --docs       default checks, plus report docs hygiene of plans/ and openspec/ (exit 0)
//   --docs --strict   same, but any docs finding exits 1 (publication tree)
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, internalPaths, isInternal, listFiles } from './lib/files.mjs';
import { isGenerated, isLicenseName, isSkippedDir } from './spdx-check.mjs';

// ---- file shape -----------------------------------------------------------------------------
export const NO_CI_PATTERNS = [
  /^\.github\/(workflows\/|dependabot\.yml|CODEOWNERS)/,
  /(^|\/)\.gitlab-ci\.yml$/,
  /^\.circleci\//,
  /azure-pipelines\.yml$/,
  /cloudbuild\.ya?ml$/,
  /(^|\/)Dockerfile/,
  /docker-compose/,
  /(^|\/)netlify\.toml$/,
  /(^|\/)vercel\.json$/,
  /\.tf$/,
  /\.tfvars$/,
];

export const FORBIDDEN_FILE_PATTERNS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.local$/,
  /\.pem$/,
  /\.p12$/,
  /\.key$/,
  /(^|\/)service-account.*\.json$/,
  /(^|\/)\.npmrc$/,
];

/** Returns the violated rule name (`NO-CI`, `FORBIDDEN-FILE`, `THIRD-PARTY`) or null. */
export function matchesForbidden(path) {
  if (NO_CI_PATTERNS.some((re) => re.test(path))) return 'NO-CI';
  if (FORBIDDEN_FILE_PATTERNS.some((re) => re.test(path))) return 'FORBIDDEN-FILE';
  if (path !== 'LICENSE' && isLicenseName(path) && !isSkippedDir(path)) return 'THIRD-PARTY';
  return null;
}

// ---- .env.example policy --------------------------------------------------------------------
const SECRET_KEY = /(SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL)/;
const SAFE_VALUE = /^(true|false|\d+|replace-me|[a-z][a-z0-9-]*|https?:\/\/(localhost|127\.0\.0\.1|[a-z0-9.-]*example\.[a-z]+)[^\s]*)$/;

/** Returns [{line, key}] for every offending KEY=value line. */
export function checkEnvExample(text) {
  const bad = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) return;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value === '') return;
    if (SECRET_KEY.test(key) || !SAFE_VALUE.test(value)) bad.push({ line: i + 1, key });
  });
  return bad;
}

// ---- prose ----------------------------------------------------------------------------------
// The three sales-style framing words the labs gate warns about.
// Spelled only here, as regex parts; never write them in prose.
export const FRAMING_WORDS = [String.raw`\bdemos?\b`, String.raw`\bpoc\b`, String.raw`\bpre-?sales?\b`];
const FRAMING_RE = new RegExp(FRAMING_WORDS.join('|'), 'i');
const PROSE_EXT = ['.md', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.yaml', '.yml', '.json', '.sh', '.html', '.txt'];

/** Returns [{line, context}] for every line holding a framing word. */
export function findFraming(text) {
  const hits = [];
  text.split('\n').forEach((l, i) => {
    if (FRAMING_RE.test(l)) hits.push({ line: i + 1, context: l.trim().slice(0, 100) });
  });
  return hits;
}

// ---- docs hygiene ---------------------------------------------------------------------------
const ABSOLUTE_PATH_RE = /\/Users\/|\/home\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users/;
// tunnel-service and deployed-service host names, written as character classes so this file
// does not contain the names themselves
const DEPLOYED_HOST_RE = /[.\/]ngr[o]k(-free)?\.(io|app|dev)|[.\/]trycloudfl[a]re\.com|[.\/]loca\.lt\b|\.run\.[a]pp\b|\.netl[i]fy\.app\b|\.verc[e]l\.app\b|\.herok[u]app\.com|\.onr[e]nder\.com/i;

/** Returns [{line, class}] with classes framing, absolute-path, deployed-host, internal-ref. */
export function findDocsHygiene(path, text, internals = internalPaths()) {
  const found = [];
  text.split('\n').forEach((l, i) => {
    const line = i + 1;
    if (FRAMING_RE.test(l)) found.push({ line, class: 'framing' });
    if (ABSOLUTE_PATH_RE.test(l)) found.push({ line, class: 'absolute-path' });
    if (DEPLOYED_HOST_RE.test(l)) found.push({ line, class: 'deployed-host' });
    if (internals.some((p) => l.includes(p))) found.push({ line, class: 'internal-ref' });
  });
  return found.map((f) => ({ ...f, path }));
}

/** Docs exit code: non-zero only in strict mode and only with findings. */
export function docsExitCode(count, strict) {
  return strict && count > 0 ? 1 : 0;
}

// ---- runner ---------------------------------------------------------------------------------
function run(flags) {
  const docsMode = flags.includes('--docs');
  const strict = flags.includes('--strict');
  const proseOnly = flags.includes('--prose');
  const files = listFiles(ROOT);
  const internals = internalPaths(ROOT);
  const read = (p) => readFileSync(join(ROOT, p), 'utf8');
  let failures = 0;
  const fail = (line) => {
    console.log(line);
    failures += 1;
  };

  if (!proseOnly) {
    for (const p of files) {
      const rule = matchesForbidden(p);
      if (rule === 'THIRD-PARTY') fail(`THIRD-PARTY ${p} (nested license file: third-party subtree risk)`);
      else if (rule) fail(`${rule} ${p}`);
    }

    for (const p of files) {
      if (basename(p) !== '.env.example') continue;
      for (const b of checkEnvExample(read(p))) fail(`ENV-EXAMPLE ${p}:${b.line} ${b.key}`);
    }

    for (const req of ['LICENSE', 'SUPPORT.md', 'CONTRIBUTING.md', 'README.md']) {
      if (!files.includes(req)) fail(`MISSING-NOTICE ${req}`);
    }
    if (files.includes('README.md') && !/unsupported/i.test(read('README.md').split('\n').slice(0, 15).join('\n'))) {
      fail('MISSING-NOTICE README.md (no "unsupported" banner in lines 1-15)');
    }
    if (files.includes('SUPPORT.md') && !/unsupported/i.test(read('SUPPORT.md'))) {
      fail('MISSING-NOTICE SUPPORT.md (no "unsupported")');
    }
    if (files.includes('CONTRIBUTING.md') && !read('CONTRIBUTING.md').includes('scripts/spdx-check.mjs')) {
      fail('MISSING-NOTICE CONTRIBUTING.md (must mention scripts/spdx-check.mjs)');
    }
  }

  for (const p of files) {
    if (isInternal(p, internals) || isGenerated(p) || isSkippedDir(p)) continue;
    if (p.startsWith('plans/') || p.startsWith('openspec/')) continue; // docs mode covers them
    if (!PROSE_EXT.includes(extname(p))) continue;
    for (const h of findFraming(read(p))) fail(`FRAMING ${p}:${h.line} ${h.context}`);
  }

  console.log(failures === 0 ? 'check-repo-rules: ok' : `check-repo-rules: ${failures} failure(s)`);
  let code = failures === 0 ? 0 : 1;

  if (docsMode) {
    let count = 0;
    for (const p of files) {
      if (extname(p) !== '.md' || isInternal(p, internals)) continue;
      if (!p.startsWith('plans/') && !p.startsWith('openspec/')) continue;
      for (const f of findDocsHygiene(p, read(p), internals)) {
        console.log(`DOCS-HYGIENE ${f.path}:${f.line} ${f.class}`);
        count += 1;
      }
    }
    console.log(`docs hygiene: ${count} finding(s)${strict ? '' : ' (not blocking in development)'}`);
    code = code || docsExitCode(count, strict);
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
