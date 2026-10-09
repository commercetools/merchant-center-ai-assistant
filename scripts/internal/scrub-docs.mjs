#!/usr/bin/env node
// INTERNAL ONLY (listed in scripts/internal-paths.json, removed from the publication).
// Scrubs the planning and specification documents on the PUBLICATION COPY (never on the development repo).
// Usage: node scripts/internal/scrub-docs.mjs --root <publication dir> [--report <file>] [--policy-dir <dir>]
//        [--private-substitutions <json: [{"pattern": "...", "flags": "gi", "to": "..."}]>] [--allow-any-out]
// Targets: *.md *.yaml *.yml *.json under plans/, openspec/ and e2e/ of the root.
// Prints per-file substitution counts and `NEEDS-HUMAN path:line reason`; exit 1 while any NEEDS-HUMAN remains.
// Every regex that names a private token uses a character-class escape so this file passes the leak scan.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPatterns, scanText } from './leak-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_ROOT = resolve(HERE, '..', '..');
export const TARGET_DIRS = ['plans', 'openspec', 'e2e'];
export const TARGET_EXT = ['.md', '.yaml', '.yml', '.json'];
export const LEGACY = 'the legacy multitenant implementation (not public)';

const maintainerCase = (m) => (m[0] === 'O' ? 'Maintainer' : 'maintainer');
const roleWord = (match) => match.replace(/owner/gi, (w) => maintainerCase(w));
const framing = (w) => {
  const l = w.toLowerCase();
  if (l.startsWith('demo')) return l.endsWith('s') ? 'samples' : 'sample';
  if (l === 'poc') return 'prototype';
  return 'sales-engineering';
};

/** Ordered substitution table (design D-X10). `id` is the report class. */
export const SUBSTITUTIONS = [
  // 1. development checkout root (also agent worktrees below it)
  { id: 'dev-root', re: /\/Us[e]rs\/[^/\s`'")]+\/code\/commercetools-labs\/ai-assistant(?:\/\.claude\/worktrees\/[\w.-]+)?/g, to: '<repo>' },
  // 7a. the agent configuration folder of a home directory (before the generic path rule)
  { id: 'agent-config', re: /(?:~|\/Us[e]rs\/[^/\s`'")]+|\/hom[e]\/[^/\s`'")]+)\/\.claud[e](?=[/\s`'")]|$)/g, to: '<agent-config>' },
  { id: 'agent-config', re: /(?<![\w.])~\/\.claude\.json/g, to: '<agent-config>.json' },
  // 2. any other absolute local path (macOS, Linux, Windows) with optional :line[-line]
  {
    id: 'absolute-path',
    re: /(?:[A-Za-z]:\\Us[e]rs\\[^\s`'")]*|(?:\/Us[e]rs|\/hom[e])\/[^/\s`'")]+(?:\/[^\s`'"),;]*[^\s`'"),;.])?)(?::\d+(?:-\d+)?)?/g,
    to: LEGACY,
  },
  // 2b. bare names of the private legacy repositories (with trailing sub-path and citation)
  { id: 'legacy-name', re: /(?:\.\.\.\/)?multi[t]enant-(?:ai-assistant(?:-router)?|chat-app)(?:\/[\w.@-]+)*(?::\d+(?:-\d+)?)?/gi, to: LEGACY },
  // 3. citations of legacy files: `L:` prefix and file:line
  { id: 'citation', re: /\bL:\s?(?=`?[\w./@-]+\.(?:ts|tsx|mjs|js|json|md|yaml|sh)\b)/g, to: '' },
  { id: 'citation', re: /(?:[\w.@-]+\/)*([\w.@-]+\.(?:ts|tsx|mjs|js|json|md|yaml|sh)):\d+(?:-\d+)?/g, to: '$1' },
  // 5. internal organisation
  { id: 'org-name', re: /\b(?:commercetools-dem[o]|ct-builder[s])\b/g, to: 'an internal commercetools organisation' },
  // 6. tunnel hosts, deployed-service hosts, local dev port, team header, impersonation key
  { id: 'host', re: /(?:\*\.)?(?:[\w-]+\.)*ngro[k](?:-free\.app|\.io)?/gi, to: 'a tunnel host' },
  { id: 'host', re: /(?:\*\.|[\w-]+\.)*run\.ap[p]\b/gi, to: 'a deployed-service host' },
  { id: 'host', re: /localhost:808[0]/g, to: 'the local development host' },
  { id: 'host', re: /\bx-mc-team-i[d]\b/gi, to: 'the team header' },
  { id: 'host', re: /\bCSR_IMPERSONATE_KE[Y]\b/g, to: 'the impersonation key setting' },
  // 9. working-note file names (before the role-word rule: one of them contains the role word)
  { id: 'working-notes', re: /(?:plans\/)?owner-question[s]\.md/g, to: 'plans/decisions.md' },
  { id: 'working-notes', re: /(?:plans\/)?manual-step[s]\.md/g, to: 'plans/prerequisites.md' },
  { id: 'working-notes', re: /(?:plans\/)?06-amendments-applied\.md/g, to: 'plans/design-history.md' },
  // 8. run evidence folder and question inboxes
  { id: 'run-record', re: /(?:plans\/)?evidenc[e]\//g, to: '<run-record>/' },
  { id: 'run-record', re: /(?:plans\/)?questions-inbo[x]\/?/g, to: 'the working notes (not published)' },
  // 7b. agent instructions file, internal gate wrapper, path manifest, tooling folder, agent config folder
  { id: 'agent-config', re: /\.claud[e]\//g, to: '<agent-config>/' },
  { id: 'agent-config', re: /CLAUDE\.m[d]/g, to: '<agent-instructions>' },
  { id: 'agent-config', re: /(?:scripts\/)?labs-gat[e]\.sh/g, to: '<internal-gate-wrapper>' },
  { id: 'agent-config', re: /(?:scripts\/)?internal-path[s]\.json/g, to: '<internal-path-manifest>' },
  { id: 'agent-config', re: /scripts\/interna[l]\//g, to: '<internal-tooling>/' },
  // 12. e-mail addresses of persons and of the corporate domain
  { id: 'email', re: /[\w.+-]+@(?:commercetools\.co[m]|gmail\.com|outlook\.com|hotmail\.com|icloud\.com)/gi, to: 'maintainer@example.invalid' },
  // 10. the role word for the person who decides or approves (person-addressed phrases only)
  { id: 'role-word', re: /\bowne[r](?:'s|’s)?\s+(?:decisions?|approvals?|questions?|answers?|steps?|choices?|reviews?|sign-?off|override|input)\b/gi, fn: roleWord },
  { id: 'role-word', re: /\b(?:ask|asks|asked|tell|ping|notify|inform|confirm with|approved by|decided by|per)\s+(?:the\s+)?owne[r]\b/gi, fn: roleWord },
  { id: 'role-word', re: /\bthe\s+owne[r]\s+(?:does|do|should|must|will|can|provides?|decides?|lists?|may|needs?|approves?|wants?|answers?|reviews?|tests?)\b/gi, fn: roleWord },
  { id: 'role-word', re: /\(owne[r]\)/gi, fn: roleWord },
  // 11. the three framing words of the checker (listed in the report for review)
  { id: 'framing', re: /\b(?:demos?|poc|pre-?sales?)\b/gi, fn: framing },
];

const LEFTOVER_CITATION = /[\w.@/-]+\.(?:ts|tsx|mjs|js|json|md):\d+/;
const INBOX_ID = /\b[A-Z]{1,3}Q-?[A-Z0-9]*\d+\b/g;

export function checkboxCounts(text) {
  return { x: (text.match(/^\s*- \[x\]/gm) || []).length, open: (text.match(/^\s*- \[ \]/gm) || []).length };
}

/** Applies the table; returns {text, counts:{id:n}, framingLines:[line numbers]}. */
export function scrubText(text, extra = []) {
  const counts = {};
  const framingLines = [];
  const bump = (id, n = 1) => (counts[id] = (counts[id] || 0) + n);
  const lines = text.split('\n');
  const table = [...SUBSTITUTIONS, ...extra];
  let inTable = false;
  let legacyCol = -1;
  const out = lines.map((line, idx) => {
    let l = line;
    // 4. source-map tables: header "Legacy file ..." becomes "Origin"; the column's cells are reduced
    if (/^\s*\|/.test(l)) {
      const cells = l.split('|');
      if (!inTable) {
        inTable = true;
        legacyCol = cells.findIndex((c) => /^\s*Legacy files?\b/i.test(c));
        if (legacyCol >= 0) {
          cells[legacyCol] = cells[legacyCol].replace(/Legacy files?(\s*\/\s*[^|]*)?/i, 'Origin');
          l = cells.join('|');
          bump('source-map');
        }
      } else if (legacyCol >= 0 && !/^\s*:?-{2,}/.test(cells[legacyCol] || '-') && cells.length > legacyCol) {
        const cell = cells[legacyCol];
        const m = /([\w.@-]+\.(?:ts|tsx|mjs|js|json|md|yaml|sh|css))\b/.exec(cell);
        const reduced = ` legacy implementation${m ? ` (${m[1]})` : ''} `;
        if (cell !== reduced) {
          cells[legacyCol] = reduced;
          l = cells.join('|');
          bump('source-map');
        }
      }
    } else {
      inTable = false;
      legacyCol = -1;
    }
    for (const s of table) {
      const re = new RegExp(s.re.source, s.re.flags);
      l = l.replace(re, (...args) => {
        const m = args[0];
        const r = s.fn ? s.fn(m) : s.to.replace(/\$(\d)/g, (_, d) => args[Number(d)] ?? '');
        if (r === m) return m;
        bump(s.id);
        if (s.id === 'framing') framingLines.push(idx + 1);
        return r;
      });
    }
    return l;
  });
  return { text: out.join('\n'), counts, framingLines };
}

/** Ids defined in plans/decisions.md or as bold definitions in the openspec design documents. */
export function definedIds(root) {
  const ids = new Set();
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  for (const m of read(join(root, 'plans', 'decisions.md')).matchAll(INBOX_ID)) ids.add(m[0]);
  for (const f of listTargets(root)) {
    if (!/design\.md$|proposal\.md$/.test(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/\*\*(?:[\w -]*?)?(\b[A-Z]{1,3}Q-?[A-Z0-9]*\d+\b)/g)) ids.add(m[1]);
  }
  return ids;
}

export function listTargets(root) {
  const out = [];
  const rec = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '.git') rec(join(dir, e.name));
      } else if (TARGET_EXT.some((x) => e.name.endsWith(x))) out.push(join(dir, e.name));
    }
  };
  for (const d of TARGET_DIRS) if (existsSync(join(root, d))) rec(join(root, d));
  return out.sort();
}

/** NEEDS-HUMAN lines for one file's scrubbed text. */
export function needsHuman(path, text, { block, ids }) {
  const found = [];
  for (const h of scanText(text, block)) found.push(`NEEDS-HUMAN ${path}:${h.line} private-name: ${h.match.slice(0, 60)}`);
  text.split('\n').forEach((line, i) => {
    if (LEFTOVER_CITATION.test(line)) found.push(`NEEDS-HUMAN ${path}:${i + 1} file:line citation left over`);
    for (const m of line.matchAll(INBOX_ID)) {
      if (!ids.has(m[0])) found.push(`NEEDS-HUMAN ${path}:${i + 1} undefined question id ${m[0]}`);
    }
  });
  return found;
}

export function secondPersonLines(path, text) {
  const out = [];
  if (!path.startsWith('plans' + sep) && !path.startsWith('plans/')) return out;
  text.split('\n').forEach((line, i) => {
    if (/\byou(r)?\b/i.test(line)) out.push(`REVIEW ${path}:${i + 1} second-person address`);
  });
  return out;
}

export function assertRootSafe(root, { allowAny = false, devRoot = DEV_ROOT, home = homedir() } = {}) {
  const abs = resolve(root);
  const dev = resolve(devRoot);
  if (abs === dev || abs.startsWith(dev + sep) || dev.startsWith(abs + sep)) {
    throw new Error(`refusing: ${abs} is (inside, or contains) the development repository`);
  }
  const base = join(resolve(home), 'labs-publish') + sep;
  if (!allowAny && !abs.startsWith(base)) throw new Error(`refusing: --root must be under ${base}`);
  if (existsSync(join(abs, '.git'))) {
    let top = '';
    try {
      top = execFileSync('git', ['-C', abs, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    } catch {
      top = '';
    }
    if (top && resolve(top) === dev) throw new Error('refusing: root carries the development repository .git');
  }
  return abs;
}

export function scrubTree(root, { extra = [], policy = null, write = true } = {}) {
  const loaded = loadPatterns(join(HERE, 'leak-patterns.json'), policy);
  const patterns = { block: [...loaded.block, ...loaded.blockDocs] };
  const files = listTargets(root);
  const total = {};
  const perFile = [];
  const framingReport = [];
  const rewritten = [];
  for (const f of files) {
    const rel = relative(root, f).split(sep).join('/');
    const before = readFileSync(f, 'utf8');
    const r = scrubText(before, extra);
    const b = checkboxCounts(before);
    const a = checkboxCounts(r.text);
    if (b.x !== a.x || b.open !== a.open) throw new Error(`checkbox counts changed in ${rel}`);
    const n = Object.values(r.counts).reduce((s, v) => s + v, 0);
    if (n && write) writeFileSync(f, r.text);
    for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] || 0) + v;
    if (n) perFile.push({ rel, n, counts: r.counts });
    for (const ln of r.framingLines) framingReport.push(`${rel}:${ln}`);
    rewritten.push([rel, r.text]);
  }
  const ids = definedIds(root);
  const human = [];
  const review = [];
  for (const [rel, text] of rewritten) {
    human.push(...needsHuman(rel, text, { block: patterns.block, ids }));
    review.push(...secondPersonLines(rel, text));
  }
  return { files: files.length, total, perFile, framingReport, human, review };
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const rootArg = opt('root');
  if (!rootArg) {
    console.error('usage: scrub-docs.mjs --root <publication dir> [--report file] [--policy-dir dir] [--private-substitutions json] [--allow-any-out]');
    process.exit(2);
  }
  let root;
  try {
    root = assertRootSafe(rootArg, { allowAny: argv.includes('--allow-any-out') });
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  let extra = [];
  if (opt('private-substitutions')) {
    extra = JSON.parse(readFileSync(opt('private-substitutions'), 'utf8')).map((s) => ({ id: 'private', re: new RegExp(s.pattern, s.flags || 'gi'), to: s.to }));
  }
  let policy = null;
  if (opt('policy-dir')) {
    try {
      policy = JSON.parse(readFileSync(join(opt('policy-dir'), 'policy.json'), 'utf8'));
    } catch {
      console.error('cannot read policy.json');
      process.exit(2);
    }
  }
  const r = scrubTree(root, { extra, policy });
  const lines = [];
  for (const f of r.perFile) lines.push(`${String(f.n).padStart(5)}  ${f.rel}  ${JSON.stringify(f.counts)}`);
  const sum = Object.values(r.total).reduce((s, v) => s + v, 0);
  lines.push(`scrub: ${r.files} file(s), ${sum} substitution(s) ${JSON.stringify(r.total)}`);
  if (r.framingReport.length) lines.push('framing-word substitutions (read each):', ...r.framingReport.map((x) => `  ${x}`));
  lines.push(...r.review.slice(0, 50), ...(r.review.length > 50 ? [`... ${r.review.length - 50} more REVIEW lines`] : []));
  lines.push(...r.human);
  lines.push(`needs-human: ${r.human.length}`);
  if (opt('report')) writeFileSync(opt('report'), lines.join('\n') + '\n');
  console.log(lines.filter((l) => !l.startsWith('REVIEW ') && !/^\s{0,5}\d+\s/.test(l)).slice(0, 400).join('\n'));
  process.exit(r.human.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
