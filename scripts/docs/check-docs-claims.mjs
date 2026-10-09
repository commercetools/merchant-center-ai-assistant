/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Machine checks of the statements the documentation must contain and must not contain.
//
//   --certify    the connector README contract: required headings, non-empty tables, every
//                connect.yaml key documented, the poison/replay statement, the three
//                "unsupported" notices, the sections of docs/operations.md
//   --citations  every `##` section of docs/architecture.md, docs/how-it-works.md and
//                FEATURES.md cites an existing repository path or a documentation URL, and every
//                quoted repository path exists
//   --scrub      no framing words, tunnel or deployed hosts, absolute local paths, internal
//                paths, real-looking e-mail addresses, emojis, marketing phrases, tenant
//                vocabulary (CHANGELOG.md excepted) and no names from scripts/internal/leak-patterns.json
//   --stale      no vocabulary of removed features in README.md, FEATURES.md and docs/
// Usage: node scripts/docs/check-docs-claims.mjs [--certify] [--citations] [--scrub] [--stale]
//        [--root <dir>] [files...]   (files restrict --citations, --scrub and --stale)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FRAMING_WORDS } from '../check-repo-rules.mjs';
import { REPO_ROOT, docFiles, headings, parseArgs, read, section, tableRows, withoutFences } from './lib.mjs';
import { readConnectYaml } from './gen-config-table.mjs';

const CITATION_FILES = ['docs/architecture.md', 'docs/how-it-works.md', 'FEATURES.md'];
const REQUIRED_DOCS = [
  'docs/architecture.md',
  'docs/how-it-works.md',
  'docs/api.md',
  'docs/configuration.md',
  'docs/deployment.md',
  'docs/permissions.md',
  'docs/security.md',
  'docs/operations.md',
  'docs/troubleshooting.md',
  'docs/privacy.md',
  'SUPPORT.md',
  'CONTRIBUTING.md',
  'FEATURES.md',
  'CHANGELOG.md',
];
const README_HEADINGS = [
  'Overview',
  'What it is not',
  'Architecture at a glance',
  'Repository layout',
  'Prerequisites',
  'Quick start (local)',
  'Deployment summary',
  'Configuration',
  'Administrator access',
  'Required scopes',
  'Fail-open and fail-closed behaviour',
  'Operations',
  'Poison messages and replay',
  'Testing',
  'Contributing',
  'Support',
  'License',
];

// ---- certify ----------------------------------------------------------------------------------

const hasBlock = (text, name) => {
  const m = new RegExp(`<!-- gen:begin ${name} -->([\\s\\S]*?)<!-- gen:end ${name} -->`).exec(text);
  return m ? tableRows(m[1]) : 0;
};

export function certify(root) {
  const problems = [];
  const exists = (p) => existsSync(join(root, p));
  for (const p of REQUIRED_DOCS) if (!exists(p)) problems.push(`MISSING-DOC ${p}`);
  if (!exists('README.md')) return [...problems, 'MISSING-DOC README.md'];

  const readme = read(root, 'README.md');
  const have = new Set(headings(readme).map((h) => h.text.replace(/`/g, '').toLowerCase()));
  for (const h of README_HEADINGS) if (!have.has(h.toLowerCase())) problems.push(`README-HEADING missing "${h}"`);

  if (!/unsupported/i.test(readme.split('\n').slice(0, 15).join('\n'))) {
    problems.push('UNSUPPORTED README.md has no "unsupported" banner in its first 15 lines');
  }
  if (exists('SUPPORT.md') && !/unsupported/i.test(read(root, 'SUPPORT.md'))) problems.push('UNSUPPORTED SUPPORT.md');

  if (hasBlock(readme, 'config') === 0) problems.push('README-TABLE configuration table (gen:config block) is empty or missing');
  if (hasBlock(readme, 'scopes') === 0) problems.push('README-TABLE scopes tables (gen:scopes block) are empty or missing');
  const failTable = section(readme, 'Fail-open and fail-closed behaviour');
  if (!failTable || tableRows(failTable) === 0) problems.push('README-TABLE fail-open and fail-closed table is empty or missing');
  const poison = section(readme, 'Poison messages and replay');
  if (!poison || !/not applicable/i.test(poison)) problems.push('README-POISON statement "not applicable" missing');

  if (exists('connect.yaml')) {
    const connect = readConnectYaml(read(root, 'connect.yaml'));
    const text = `${readme}\n${exists('docs/configuration.md') ? read(root, 'docs/configuration.md') : ''}`;
    const keys = new Set(connect.applications.flatMap((a) => a.keys.map((k) => k.key)));
    for (const key of keys) if (!text.includes(key)) problems.push(`CONFIG-KEY ${key} is not documented in README.md or docs/configuration.md`);
    if (!/ADMIN_USER_IDS/.test(readme)) problems.push('CONFIG-KEY ADMIN_USER_IDS missing from README.md');
  }

  if (exists('docs/operations.md')) {
    const ops = read(root, 'docs/operations.md');
    const poisonOps = section(ops, 'Poison messages and replay');
    if (!poisonOps || !/not applicable/i.test(poisonOps)) problems.push('OPERATIONS "Poison messages and replay" with "not applicable" missing');
    const retention = section(ops, 'Data retention');
    if (!retention || !/no automatic deletion/i.test(retention)) problems.push('OPERATIONS "Data retention" with "no automatic deletion" missing');
    const failOps = section(ops, 'Fail-open and fail-closed behaviour');
    if (!failOps || tableRows(failOps) === 0) problems.push('OPERATIONS fail-open and fail-closed table missing');
  }
  if (exists('docs/privacy.md') && !/no automatic deletion/i.test(read(root, 'docs/privacy.md'))) {
    problems.push('PRIVACY retention statement "no automatic deletion" missing');
  }
  if (exists('docs/permissions.md')) {
    const perm = read(root, 'docs/permissions.md');
    for (const needle of ['ADMIN_USER_IDS', 'Your user ID', 'userLabel']) {
      if (!perm.includes(needle)) problems.push(`PERMISSIONS docs/permissions.md does not mention ${needle}`);
    }
  }
  if (exists('docs/troubleshooting.md')) {
    const t = read(root, 'docs/troubleshooting.md');
    if (!/nobody is (an? )?admin/i.test(t)) problems.push('TROUBLESHOOTING entry "nobody is admin because ADMIN_USER_IDS is empty" missing');
    if (!/not shown as (an? )?administrator/i.test(t)) problems.push('TROUBLESHOOTING entry "I am not shown as administrator" missing');
  }
  return problems;
}

// ---- citations --------------------------------------------------------------------------------

// A repository path starts with one of the top-level folders of the repository.
const REPO_PATH = /^(service|mc-app|composed-apps|mc-view-app|scripts|docs|contract|e2e)\/[\w@.\/-]*$/;

/** Backticked tokens of a section body that are repository paths (placeholders and ignored files are skipped). */
export function quotedPaths(body) {
  const out = [];
  for (const m of body.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim();
    if (!REPO_PATH.test(token) || /[*<>{}]|\.env\./.test(token)) continue;
    out.push(token);
  }
  return out;
}

/** Splits a Markdown text into its `##` sections: [{ title, line, body }]. */
export function sections(text) {
  const lines = text.split('\n');
  const hs = headings(text).filter((h) => h.level === 2);
  return hs.map((h, i) => {
    const end = i + 1 < hs.length ? hs[i + 1].line - 1 : lines.length;
    return { title: h.text, line: h.line, body: lines.slice(h.line, end).join('\n') };
  });
}

export function citations(root, files = CITATION_FILES) {
  const problems = [];
  for (const file of files) {
    if (!existsSync(join(root, file))) {
      problems.push(`MISSING-DOC ${file}`);
      continue;
    }
    for (const s of sections(read(root, file))) {
      const body = withoutFences(s.body).join('\n');
      const paths = quotedPaths(body);
      const missing = paths.filter((p) => !existsSync(join(root, p)));
      for (const p of missing) problems.push(`CITATION ${file}:${s.line} path does not exist: ${p}`);
      const hasUrl = /https:\/\/docs\.commercetools\.com\S*/.test(body);
      if (paths.length - missing.length === 0 && !hasUrl) {
        problems.push(`CITATION ${file}:${s.line} section "${s.title}" cites no repository path or documentation URL`);
      }
    }
  }
  return problems;
}

// ---- scrub ------------------------------------------------------------------------------------

const FRAMING_RE = new RegExp(FRAMING_WORDS.join('|'), 'i');
// Host names are written as character classes so this file does not contain them.
const HOST_RE = /ngr[o]k|trycloudfl[a]re|loca\.lt\b|\.run\.[a]pp\b|\.netl[i]fy\.app\b|\.verc[e]l\.app\b|\.herok[u]app\.com/i;
const ABS_PATH_RE = /\/Users\/|\/home\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const MARKETING_RE = /\b(we are excited|world-class|best-in-class|cutting-edge|state-of-the-art|blazing|revolutionary|game-chang\w+|seamless(ly)?|next-generation|industry-leading)\b/i;
const TENANT_RE = /multi-?tenan\w*|\btenan\w*/i;

export function leakPatterns(root) {
  const file = join(root, 'scripts', 'internal', 'leak-patterns.json');
  if (!existsSync(file)) return [];
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(json) ? json : json.patterns ?? json.tokens ?? [];
  return list.filter((x) => typeof x === 'string' && x.length > 2).map((x) => new RegExp(x, 'i'));
}

export function internalFragments(root) {
  const file = join(root, 'scripts', 'internal-paths.json');
  if (!existsSync(file)) return [];
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(json.paths) ? json.paths : [];
}

export function scrubText(file, text, { leaks = [], internals = [] } = {}) {
  const problems = [];
  const isChangelog = file === 'CHANGELOG.md';
  text.split('\n').forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    if (FRAMING_RE.test(line)) problems.push(`SCRUB-FRAMING ${where}`);
    if (HOST_RE.test(line)) problems.push(`SCRUB-HOST ${where}`);
    if (ABS_PATH_RE.test(line)) problems.push(`SCRUB-LOCAL-PATH ${where}`);
    for (const m of line.matchAll(EMAIL_RE)) {
      if (!/@example\.(com|org|test)$/i.test(m[0])) problems.push(`SCRUB-EMAIL ${where} ${m[0]}`);
    }
    if (EMOJI_RE.test(line)) problems.push(`SCRUB-EMOJI ${where}`);
    if (MARKETING_RE.test(line)) problems.push(`SCRUB-MARKETING ${where}`);
    if (!isChangelog && TENANT_RE.test(line)) problems.push(`SCRUB-TENANT ${where}`);
    for (const re of leaks) if (re.test(line)) problems.push(`SCRUB-LEAK ${where}`);
    for (const p of internals) if (line.includes(p)) problems.push(`SCRUB-INTERNAL ${where} ${p}`);
  });
  return problems;
}

export function scrub(root, files = docFiles(root)) {
  const leaks = leakPatterns(root);
  const internals = internalFragments(root);
  return files.flatMap((file) => scrubText(file, read(root, file), { leaks, internals }));
}

// ---- stale ------------------------------------------------------------------------------------

export const STALE_RE = /tenant|firestore|team mcp|data warehouse|gecx|anthropic|openai|assistant-admin|permission group|cloud run|pub\/sub/i;

export function stale(root, files) {
  const list = files ?? ['README.md', 'FEATURES.md', ...docFiles(root).filter((f) => f.startsWith('docs/'))];
  const problems = [];
  for (const file of [...new Set(list)]) {
    if (!existsSync(join(root, file))) continue;
    read(root, file)
      .split('\n')
      .forEach((line, i) => {
        const m = STALE_RE.exec(line);
        if (m) problems.push(`STALE ${file}:${i + 1} "${m[0]}"`);
      });
  }
  return problems;
}

// ---- runner -----------------------------------------------------------------------------------

export function run(argv, log = console.log) {
  const { flags, positional } = parseArgs(argv, ['--root']);
  const root = flags.get('--root') ?? REPO_ROOT;
  const modes = ['--certify', '--citations', '--scrub', '--stale'].filter((m) => flags.has(m));
  if (modes.length === 0) {
    log('usage: check-docs-claims.mjs [--certify] [--citations] [--scrub] [--stale] [files...]');
    return 2;
  }
  const files = positional.length > 0 ? positional : undefined;
  let problems = [];
  if (flags.has('--certify')) problems.push(...certify(root));
  if (flags.has('--citations')) problems.push(...citations(root, files));
  if (flags.has('--scrub')) problems.push(...scrub(root, files));
  if (flags.has('--stale')) problems.push(...stale(root, files));
  problems = [...new Set(problems)];
  for (const p of problems) log(p);
  log(problems.length === 0 ? `check-docs-claims: ok (${modes.join(' ')})` : `check-docs-claims: ${problems.length} problem(s)`);
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
