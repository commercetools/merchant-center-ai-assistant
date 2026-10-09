#!/usr/bin/env node
// INTERNAL ONLY (listed in scripts/internal-paths.json, removed from the publication).
// Builds the publication directory ($PUB) from `git archive HEAD` and walks it through the stages
//   archive -> scrub -> ossify -> check -> commit -> gate        (default: all)
// Usage:
//   node scripts/internal/prepare-publish.mjs --out <dir> [--year 2026] [--stage <name>|all]
//        [--evidence <dir>] [--allow-any-out] [--ack] [--message-file <file>]
// Needs LABS_PUBLISH_DIR (ossify.mjs, gate.mjs, policy.json) for the ossify, check, gate stages.
// It never edits the development repository and never pushes anywhere.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEV_ROOT = resolve(HERE, '..', '..');
export const STAGES = ['archive', 'scrub', 'ossify', 'check', 'commit', 'gate'];
export const NEUTRAL_DOCS = ['plans/decisions.md', 'plans/prerequisites.md', 'plans/design-history.md'];
export const REPO_URL = 'https://github.com/commercetools/ai-assistant';

/** Patterns that must not appear in the `git add --dry-run .` listing (spec: History is a single fresh commit). */
export const FORBIDDEN_LISTING = [
  /(^|\/)\.env($|\.(?!example$))/, /node_modules\//, /(^|\/)build\//, /(^|\/)public\//, /\.log$/, /\.DS_Store/, /\.pem$/, /\.key$/,
];

// ------------------------------------------------------------------ pure helpers (unit tested)

export function publishRoot() {
  return join(homedir(), 'labs-publish') + sep;
}

/** Throws unless `out` is a safe place to create/delete a publication directory. */
export function assertOutSafe(out, { devRoot = DEV_ROOT, allowAny = false, home = homedir() } = {}) {
  const abs = resolve(out);
  const dev = resolve(devRoot);
  if (abs === dev || abs.startsWith(dev + sep)) throw new Error(`--out ${abs} is inside the development repository`);
  if (dev.startsWith(abs + sep)) throw new Error(`--out ${abs} contains the development repository`);
  if (abs === resolve(home) || abs === sep || abs.split(sep).filter(Boolean).length < 2) {
    throw new Error(`--out ${abs} is too broad`);
  }
  const base = join(resolve(home), 'labs-publish') + sep;
  if (!allowAny && !abs.startsWith(base)) throw new Error(`--out must be under ${base} (or pass --allow-any-out)`);
  return abs;
}

export function readInternalPaths(devRoot = DEV_ROOT) {
  const j = JSON.parse(readFileSync(join(devRoot, 'scripts', 'internal-paths.json'), 'utf8'));
  return j.paths;
}

/** Remove every internal path from `root`; returns the list of paths that existed. */
export function pruneInternal(root, paths) {
  const removed = [];
  for (const p of paths) {
    const target = join(root, p);
    if (resolve(target) === resolve(root) || !resolve(target).startsWith(resolve(root) + sep)) {
      throw new Error(`refusing to remove ${p}`);
    }
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      removed.push(p);
    }
  }
  return removed;
}

function walkAll(root, skip = new Set(['.git'])) {
  const out = [];
  const rec = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(dir, e.name);
      out.push(p);
      if (e.isDirectory()) rec(p);
    }
  };
  rec(root);
  return out;
}

/** Things that must not exist anywhere in the publication tree. */
export function findForbiddenLeftovers(root) {
  const bad = [];
  for (const p of walkAll(root)) {
    const rel = relative(root, p);
    const name = rel.split(sep).pop();
    if (rel === '.github' || rel.startsWith('.github' + sep)) bad.push(rel);
    else if (/^Dockerfile/.test(name)) bad.push(rel);
    else if (name === 'netlify.toml') bad.push(rel);
    else if (/^\.env($|\.)/.test(name) && name !== '.env.example' && !/\.example$/.test(name)) bad.push(rel);
  }
  return [...new Set(bad)].sort();
}

export function missingNeutralDocs(root) {
  return NEUTRAL_DOCS.filter((f) => !existsSync(join(root, f)));
}

function detectIndent(text) {
  const m = /^(\s+)"/m.exec(text);
  return m ? m[1] : '  ';
}

/** Sets repository / bugs / homepage on one package.json text; returns the new text. */
export function setRepositoryMetadata(text, relDir) {
  const indent = detectIndent(text);
  const json = JSON.parse(text);
  const repository = { type: 'git', url: `git+${REPO_URL}.git` };
  if (relDir && relDir !== '.' && relDir !== 'scripts') repository.directory = relDir;
  json.repository = repository;
  json.bugs = { url: `${REPO_URL}/issues` };
  json.homepage = `${REPO_URL}#readme`;
  return JSON.stringify(json, null, indent) + (text.endsWith('\n') ? '\n' : '');
}

export function packageJsonFiles(root) {
  return walkAll(root, new Set(['.git', 'node_modules'])).filter((p) => p.endsWith(`${sep}package.json`));
}

export function applyMetadata(root) {
  const changed = [];
  for (const f of packageJsonFiles(root)) {
    const text = readFileSync(f, 'utf8');
    const next = setRepositoryMetadata(text, relative(root, dirname(f)).split(sep).join('/'));
    if (next !== text) {
      writeFileSync(f, next);
      changed.push(relative(root, f));
    }
  }
  return changed;
}

/** Returns offending paths of a `git add --dry-run .` listing (already stripped of the `add '` prefix). */
export function checkAddListing(paths) {
  return paths.filter((p) => FORBIDDEN_LISTING.some((re) => re.test(p)));
}

export function parseAddDryRun(output) {
  return output.split('\n').filter(Boolean).map((l) => l.replace(/^add '/, '').replace(/'$/, ''));
}

// ------------------------------------------------------------------ side-effecting stages

function log(msg) {
  console.log(msg);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...opts });
  return { status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function need(cond, msg) {
  if (!cond) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
}

function labsDir() {
  const dir = process.env.LABS_PUBLISH_DIR;
  need(dir && existsSync(join(dir, 'ossify.mjs')) && existsSync(join(dir, 'gate.mjs')), 'LABS_PUBLISH_DIR must point at the directory with ossify.mjs and gate.mjs');
  return dir;
}

function stageArchive(ctx) {
  const { out } = ctx;
  const status = execFileSync('git', ['-C', DEV_ROOT, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
  need(!status, 'development repository has uncommitted changes (the archive would not match the working tree)');
  need(!existsSync(out) || readdirSync(out).length === 0, `${out} exists and is not empty (remove it yourself first)`);
  mkdirSync(out, { recursive: true });
  const tar = execFileSync('git', ['-C', DEV_ROOT, 'archive', '--format=tar', 'HEAD'], { maxBuffer: 2 * 1024 * 1024 * 1024 });
  const x = spawnSync('tar', ['-x', '-C', out], { input: tar });
  need(x.status === 0, 'tar extraction failed');
  const removed = pruneInternal(out, readInternalPaths());
  log(`archive: extracted HEAD ${execFileSync('git', ['-C', DEV_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()}; removed internal paths: ${removed.join(' ') || '(none)'}`);
  const bad = findForbiddenLeftovers(out);
  need(!bad.length, `forbidden leftovers in the tree: ${bad.join(', ')}`);
  const missing = missingNeutralDocs(out);
  need(!missing.length, `missing neutral documents: ${missing.join(', ')}`);
  for (const p of ['plans', 'openspec', 'LICENSE', 'README.md', 'SUPPORT.md', 'CONTRIBUTING.md']) need(existsSync(join(out, p)), `${p} missing from the archive`);
  need(!existsSync(join(out, 'scripts', 'internal')), 'scripts/internal still present');
  log('archive: OK');
}

function stageScrub(ctx) {
  const args = [join(HERE, 'scrub-docs.mjs'), '--root', ctx.out, '--report', join(ctx.evidence, 'scrub-report.txt')];
  if (ctx.allowAny) args.push('--allow-any-out');
  const r = run('node', args);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  need(r.status === 0, 'scrub reported NEEDS-HUMAN lines (fix them in the development repository and rebuild)');
  log('scrub: OK');
}

function stageOssify(ctx) {
  const dir = labsDir();
  const ossify = (extra) => run('node', [join(dir, 'ossify.mjs'), '--repo', ctx.out, '--year', String(ctx.year), ...extra]);
  const save = (name, r) => writeFileSync(join(ctx.evidence, name), r.stdout + r.stderr);
  const dry = ossify([]);
  save('ossify-dry.txt', dry);
  need(dry.status === 0, 'ossify dry run failed');
  need(/^0\s+FOREIGN COPYRIGHT/m.test(dry.stdout), 'ossify reports FOREIGN COPYRIGHT files');
  need(!/THIRD-PARTY DIRECTORIES EXCLUDED/.test(dry.stdout), 'ossify reports third-party directories');
  const apply = ossify(['--apply']);
  save('ossify-apply.txt', apply);
  need(apply.status === 0, 'ossify --apply failed');
  const changed = applyMetadata(ctx.out);
  log(`ossify: metadata set in ${changed.length} package.json file(s)`);
  const second = ossify([]);
  save('ossify-second.txt', second);
  need(/^0\s+headered/m.test(second.stdout), 'second ossify run still headers files');
  need(/^0\s+package\.json renamed/m.test(second.stdout), 'second ossify run still renames packages');
  need(/^0\s+FOREIGN COPYRIGHT/m.test(second.stdout), 'second ossify run reports foreign copyright');
  for (const f of packageJsonFiles(ctx.out)) {
    const name = JSON.parse(readFileSync(f, 'utf8')).name;
    need(name === undefined || /^@commercetools-labs\/ai-assistant/.test(name), `package name ${name} in ${relative(ctx.out, f)}`);
  }
  log('ossify: OK');
}

function stageCheck(ctx) {
  const dir = labsDir();
  const steps = [
    ['spdx-check', 'node', ['scripts/spdx-check.mjs'], ctx.out],
    ['check-repo-rules', 'node', ['scripts/check-repo-rules.mjs'], ctx.out],
    ['npm ci scripts', 'npm', ['ci', '--prefix', 'scripts', '--no-audit', '--no-fund'], ctx.out],
    ['check-connect-layout', 'node', ['scripts/check-connect-layout.mjs'], ctx.out],
    ['docs hygiene strict', 'node', ['scripts/check-repo-rules.mjs', '--docs', '--strict'], ctx.out],
    ['openspec validate', 'openspec', ['validate', '--all', '--strict'], ctx.out],
    ['leak-check', 'node', [join(HERE, 'leak-check.mjs'), '--root', ctx.out, '--policy-dir', dir], ctx.out],
  ];
  const logFile = join(ctx.evidence, 'check.log');
  writeFileSync(logFile, '');
  let failed = null;
  for (const [name, cmd, args, cwd] of steps) {
    const r = run(cmd, args, { cwd });
    appendFileSync(logFile, `\n=== ${name} (exit ${r.status})\n${r.stdout}${r.stderr}`);
    log(`check: ${name} -> exit ${r.status}`);
    if (name === 'leak-check') writeFileSync(join(ctx.evidence, 'leak.txt'), r.stdout);
    if (r.status !== 0) {
      failed = name;
      break;
    }
  }
  // dependency folders must not stay in the tree that gets committed
  rmSync(join(ctx.out, 'scripts', 'node_modules'), { recursive: true, force: true });
  need(!failed, `check "${failed}" failed (details in ${logFile})`);
  log('check: OK');
}

function stageCommit(ctx) {
  const git = (...a) => execFileSync('git', ['-C', ctx.out, ...a], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  need(!existsSync(join(ctx.out, '.git')), 'a .git directory already exists in the publication directory (rebuild from scratch)');
  git('init', '-q', '-b', 'main');
  const files = parseAddDryRun(git('add', '--dry-run', '.'));
  writeFileSync(join(ctx.evidence, 'add-dry-run.txt'), files.join('\n') + '\n');
  const bad = checkAddListing(files);
  need(!bad.length, `forbidden paths in the add listing: ${bad.slice(0, 10).join(', ')}`);
  const sizes = files.map((f) => [f, statSync(join(ctx.out, f)).size]).sort((a, b) => b[1] - a[1]);
  log('commit: 20 largest files');
  for (const [f, s] of sizes.slice(0, 20)) log(`  ${String(s).padStart(9)}  ${f}`);
  const big = sizes.filter(([, s]) => s > 1024 * 1024);
  if (big.length) log(`commit: WARNING ${big.length} file(s) over 1 MB need a justification in the evidence`);
  git('add', '.');
  const msgFile = ctx.messageFile;
  need(existsSync(msgFile), `commit message file ${msgFile} missing`);
  git('commit', '-q', '-F', resolve(msgFile));
  const count = git('rev-list', '--count', 'HEAD').trim();
  need(count === '1', `expected exactly 1 commit, found ${count}`);
  const tracked = git('ls-files').split('\n').filter(Boolean).length;
  need(tracked === files.length, `tracked ${tracked} != dry-run ${files.length}`);
  const sha = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(ctx.evidence, 'final-sha.txt'), sha + '\n');
  log(`commit: OK ${sha} (${tracked} files, 1 commit)`);
}

function stageGate(ctx) {
  const dir = labsDir();
  const args = [join(dir, 'gate.mjs'), '--repo', ctx.out];
  if (ctx.ack) args.push('--ack');
  const r = run('node', args);
  writeFileSync(join(ctx.evidence, 'gate.txt'), r.stdout + r.stderr);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  need(r.status === 0, `gate exit ${r.status}`);
  log('gate: OK');
}

const STAGE_FN = { archive: stageArchive, scrub: stageScrub, ossify: stageOssify, check: stageCheck, commit: stageCommit, gate: stageGate };

function main() {
  const argv = process.argv.slice(2);
  const opt = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const flag = (n) => argv.includes(`--${n}`);
  const outArg = opt('out');
  need(outArg, 'usage: prepare-publish.mjs --out <dir> [--year Y] [--stage name|all] [--evidence dir] [--allow-any-out] [--ack]');
  let out;
  try {
    out = assertOutSafe(outArg, { allowAny: flag('allow-any-out') });
  } catch (e) {
    console.error(`REFUSED: ${e.message}`);
    process.exit(2);
  }
  const stage = opt('stage', 'all');
  need(stage === 'all' || STAGES.includes(stage), `unknown stage ${stage}`);
  const evidence = resolve(opt('evidence', `${out}-evidence`));
  mkdirSync(evidence, { recursive: true });
  const ctx = {
    out,
    evidence,
    year: opt('year', new Date().getFullYear()),
    allowAny: flag('allow-any-out'),
    ack: flag('ack'),
    messageFile: opt('message-file', join(HERE, 'commit-message.txt')),
  };
  for (const s of stage === 'all' ? STAGES : [stage]) STAGE_FN[s](ctx);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
