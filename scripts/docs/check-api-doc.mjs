/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Compares the REST routes of the service with the route table of docs/api.md.
//
// Routes are read from the source with regular expressions:
//   service/src/app.ts                  app.use('/service' | SERVICE_BASE_PATH, serviceRouter)
//   service/src/routes/service.route.ts serviceRouter.use('/prefix', ...middleware, someRouter)
//   the file that defines someRouter    someRouter.get('/path', ...) and router.get('/path', ...)
// The docs table is every Markdown table whose header has the columns Method and Path.
// Path parameters are normalised (`:sessionId` and `:id` are the same).
// Usage: node scripts/docs/check-api-doc.mjs [--root <dir>] [--doc docs/api.md]
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, parseArgs, withoutFences } from './lib.mjs';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export const normalisePath = (path) => {
  const cleaned = path.replace(/:[A-Za-z0-9_]+/g, ':param').replace(/\/{2,}/g, '/');
  return cleaned.length > 1 ? cleaned.replace(/\/$/, '') : cleaned;
};

const join2 = (...parts) => normalisePath(`/${parts.join('/')}`);

/** Resolves `import { name } from './x'` of a TypeScript source to a path relative to the root. */
function importedFile(root, fromFile, source, name) {
  const re = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'([^']+)'`);
  const m = re.exec(source);
  if (!m) return undefined;
  const base = normalize(join(dirname(fromFile), m[1]));
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(join(root, candidate))) return candidate;
  }
  return undefined;
}

/** Route definitions `<receiver>.<method>('<path>'` of a source text. */
export function routeCalls(source) {
  const out = [];
  const re = new RegExp(`\\b(\\w*[Rr]outer|app)\\.(${METHODS.join('|')})\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
  for (const m of source.matchAll(re)) out.push({ receiver: m[1], method: m[2].toUpperCase(), path: m[3] });
  return out;
}

/** The set of `METHOD /full/path` strings the service answers. */
export function routesFromCode(root) {
  const appFile = 'service/src/app.ts';
  const mountFile = 'service/src/routes/service.route.ts';
  const app = readFileSync(join(root, appFile), 'utf8');
  const mount = readFileSync(join(root, mountFile), 'utf8');
  const out = new Set();

  // The base is a literal or the shared SERVICE_BASE_PATH constant.
  let base = /app\.use\(\s*'([^']+)'\s*,\s*serviceRouter\s*\)/.exec(app)?.[1];
  if (base === undefined && /app\.use\(\s*SERVICE_BASE_PATH\s*,\s*serviceRouter\s*\)/.test(app)) {
    const constFile = join(root, 'service/src/constants/service-path.ts');
    base = existsSync(constFile)
      ? /SERVICE_BASE_PATH\s*=\s*'([^']+)'/.exec(readFileSync(constFile, 'utf8'))?.[1]
      : undefined;
  }
  if (base === undefined) throw new Error(`${appFile}: no app.use('<base>', serviceRouter) found`);
  for (const r of routeCalls(app).filter((c) => c.receiver === 'app')) out.add(`${r.method} ${join2(r.path)}`);

  for (const m of mount.matchAll(/serviceRouter\.use\(\s*'([^']+)'\s*,([^;]*)\)\s*;/g)) {
    const prefix = m[1];
    const identifiers = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    const ident = identifiers[identifiers.length - 1].replace(/\(\)$/, '');
    const factory = /^create\w+\(\)$/.test(identifiers[identifiers.length - 1]);
    const file = importedFile(root, mountFile, mount, ident.replace(/^create/, 'create'));
    if (!file) throw new Error(`${mountFile}: cannot find the file that defines ${ident}`);
    const source = readFileSync(join(root, file), 'utf8');
    const receivers = new Set([ident, 'router']);
    const calls = routeCalls(source).filter((c) => receivers.has(c.receiver) || factory);
    if (calls.length === 0) throw new Error(`${file}: no routes found for ${ident}`);
    for (const c of calls) out.add(`${c.method} ${join2(base, prefix, c.path === '/' ? '' : c.path)}`);
  }
  return out;
}

/** The set of `METHOD /path` strings of the route tables of a Markdown text. */
export function routesFromDoc(text) {
  const out = new Set();
  const lines = withoutFences(text);
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].split('|').map((c) => c.trim().toLowerCase());
    const mi = header.indexOf('method');
    const pi = header.indexOf('path');
    if (mi === -1 || pi === -1) continue;
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j += 1) {
      const cells = lines[j].split('|').map((c) => c.trim().replace(/`/g, ''));
      const method = cells[mi]?.toUpperCase();
      const path = cells[pi];
      if (method && path?.startsWith('/')) out.add(`${method} ${normalisePath(path)}`);
    }
  }
  return out;
}

/** Runs the check; returns the exit code. */
export function run(argv, log = console.log) {
  const { flags } = parseArgs(argv, ['--root', '--doc']);
  const root = flags.get('--root') ?? REPO_ROOT;
  const docPath = flags.get('--doc') ?? 'docs/api.md';
  let code;
  try {
    code = routesFromCode(root);
  } catch (error) {
    log(`check-api-doc: ${error.message}`);
    return 1;
  }
  if (!existsSync(join(root, docPath))) {
    log(`MISSING ${docPath}`);
    return 1;
  }
  const doc = routesFromDoc(readFileSync(join(root, docPath), 'utf8'));
  const missing = [...code].filter((r) => !doc.has(r)).sort();
  const extra = [...doc].filter((r) => !code.has(r)).sort();
  for (const r of missing) log(`UNDOCUMENTED ${r} (in code, not in ${docPath})`);
  for (const r of extra) log(`NOT-IN-CODE ${r} (in ${docPath}, not in code)`);
  const failures = missing.length + extra.length;
  log(failures === 0 ? `check-api-doc: ok (${code.size} routes)` : `check-api-doc: ${failures} difference(s)`);
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
