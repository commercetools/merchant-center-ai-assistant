/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Generates the configuration and scope tables of the documentation from the files that define
// them, so the documents cannot drift:
//   connect.yaml                           configuration keys, API client scopes
//   <app>/custom-*-config.mjs              Merchant Center OAuth scopes of the apps and the view
//   docs/scope-reasons.json                the reason column of the scope tables
//
// Usage: node scripts/docs/gen-config-table.mjs [--check] [--root <dir>] [files...]
//   default files: README.md docs/configuration.md
//   A file holds one or more blocks between `<!-- gen:begin NAME -->` and `<!-- gen:end NAME -->`.
//   NAME is `config` or `scopes`. Without --check the blocks are rewritten; with --check nothing
//   is written and the exit code is 1 when a block differs from what the sources produce.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { REPO_ROOT, parseArgs } from './lib.mjs';

export const DEFAULT_FILES = ['README.md', 'docs/configuration.md'];
export const OAUTH_SOURCES = [
  { app: 'mc-app', file: 'mc-app/custom-application-config.mjs' },
  { app: 'composed-apps', file: 'composed-apps/custom-application-config.mjs' },
  { app: 'mc-view-app', file: 'mc-view-app/custom-view-config.mjs' },
];
export const BLOCK_SOURCES = {
  config: ['connect.yaml'],
  scopes: ['connect.yaml', ...OAUTH_SOURCES.map((s) => s.file), 'docs/scope-reasons.json'],
};

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Reads connect.yaml: applications with their keys and the API client scopes. */
export function readConnectYaml(text) {
  const doc = parse(text);
  const applications = (doc.deployAs ?? []).map((app) => {
    const conf = app.configuration ?? {};
    const keys = [];
    for (const key of conf.standardConfiguration ?? []) keys.push({ ...key, secured: false });
    for (const key of conf.securedConfiguration ?? []) keys.push({ ...key, secured: true });
    return { name: app.name, type: app.applicationType, endpoint: app.endpoint, keys };
  });
  const scopes = doc.inheritAs?.apiClient?.scopes ?? [];
  const shared = [];
  const global = doc.inheritAs?.configuration ?? {};
  for (const key of global.standardConfiguration ?? []) shared.push({ ...key, secured: false });
  for (const key of global.securedConfiguration ?? []) shared.push({ ...key, secured: true });
  return { applications, scopes, shared };
}

/** Quoted strings of the array that follows `name:` inside the text (comments removed). */
function arrayOf(text, name) {
  const m = new RegExp(`\\b${name}\\s*:\\s*\\[([\\s\\S]*?)\\]`).exec(text);
  if (!m) return [];
  return [...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2]);
}

/** Reads `oAuthScopes: { view: [...], manage: [...] }` from a Merchant Center config file. */
export function readOAuthScopes(text) {
  const key = text.indexOf('oAuthScopes:');
  const open = key === -1 ? -1 : text.indexOf('{', key);
  if (open === -1) return { view: [], manage: [] };
  let depth = 0;
  let end = text.length;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const block = text.slice(open, end + 1);
  return { view: arrayOf(block, 'view'), manage: arrayOf(block, 'manage') };
}

function renderKeyTable(out, keys) {
  out.push('| Key | Kind | Required | Default | Description |', '| --- | --- | --- | --- | --- |');
  for (const k of keys) {
    const kind = k.secured ? 'secured' : 'standard';
    const required = k.required === true ? 'yes' : 'no';
    // Secured keys never show a value.
    const def = !k.secured && k.default !== undefined && k.default !== '' ? `\`${cell(k.default)}\`` : '';
    out.push(`| \`${k.key}\` | ${kind} | ${required} | ${def} | ${cell(k.description)} |`);
  }
  out.push('');
}

/** The configuration tables, one per application, then the keys shared by all of them. */
export function renderConfig(connect) {
  const out = [];
  for (const app of connect.applications) {
    const where = app.endpoint ? `${app.type}, endpoint \`${app.endpoint}\`` : app.type;
    out.push(`**\`${app.name}\`** (${where})`, '');
    renderKeyTable(out, app.keys);
  }
  if (connect.shared?.length) {
    out.push('**Shared by all applications** (`inheritAs.configuration` in `connect.yaml`, set once per deployment without an application prefix)', '');
    renderKeyTable(out, connect.shared);
  }
  return out.join('\n').trimEnd();
}

/** The scope tables: API client scopes of the service and OAuth scopes of the apps and the view. */
export function renderScopes(connect, oauth, reasons) {
  const out = [];
  out.push('**API client scopes of the service** (`inheritAs.apiClient.scopes` in `connect.yaml`)', '');
  out.push('| Scope | Why the service needs it |', '| --- | --- |');
  for (const scope of connect.scopes) {
    const why = reasons.api?.[scope];
    if (!why) throw new Error(`docs/scope-reasons.json has no "api" reason for the scope ${scope}`);
    out.push(`| \`${scope}\` | ${cell(why)} |`);
  }
  out.push('');
  out.push('**OAuth scopes of the Merchant Center applications and the Custom View** (`oAuthScopes` of each config file)', '');
  out.push('| Scope | Access | Used by | Why |', '| --- | --- | --- | --- |');
  const rows = new Map();
  for (const { app, scopes } of oauth) {
    for (const access of ['view', 'manage']) {
      for (const scope of scopes[access]) {
        const row = rows.get(scope) ?? { access, apps: [] };
        row.apps.push(app);
        rows.set(scope, row);
      }
    }
  }
  // Scopes with the same access, users and reason share one row, so a shared generic reason is
  // stated once and not once per scope.
  const grouped = new Map();
  for (const [scope, row] of rows) {
    const why = reasons.oauth?.[scope] ?? reasons.oauthDefault;
    if (!why) throw new Error(`docs/scope-reasons.json has no reason for the OAuth scope ${scope}`);
    const key = `${row.access}\u0000${row.apps.join(',')}\u0000${why}`;
    const group = grouped.get(key) ?? { access: row.access, apps: row.apps, why, scopes: [] };
    group.scopes.push(scope);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    const names = group.scopes.map((scope) => `\`${scope}\``).join(', ');
    out.push(`| ${names} | ${group.access} | ${group.apps.map((a) => `\`${a}\``).join(', ')} | ${cell(group.why)} |`);
  }
  return out.join('\n');
}

const MARK = (kind, name) => `<!-- gen:${kind} ${name} -->`;
const NOTE = '<!-- Generated by scripts/docs/gen-config-table.mjs. Do not edit by hand. -->';

/** Replaces every known generated block of `text`; returns { text, names }. */
export function replaceBlocks(text, rendered) {
  const names = [];
  let result = text;
  for (const [name, body] of Object.entries(rendered)) {
    const begin = MARK('begin', name);
    const end = MARK('end', name);
    const from = result.indexOf(begin);
    if (from === -1) continue;
    const to = result.indexOf(end, from);
    if (to === -1) throw new Error(`block ${name}: ${end} is missing`);
    result = `${result.slice(0, from)}${begin}\n${NOTE}\n\n${body}\n\n${result.slice(to)}`;
    names.push(name);
  }
  return { text: result, names };
}

/** Renders every block from the sources under `root`. */
export function renderAll(root) {
  const connect = readConnectYaml(readFileSync(join(root, 'connect.yaml'), 'utf8'));
  const oauth = OAUTH_SOURCES.filter((s) => existsSync(join(root, s.file))).map((s) => ({
    app: s.app,
    scopes: readOAuthScopes(readFileSync(join(root, s.file), 'utf8')),
  }));
  const reasonsFile = join(root, 'docs', 'scope-reasons.json');
  const reasons = existsSync(reasonsFile) ? JSON.parse(readFileSync(reasonsFile, 'utf8')) : {};
  return { config: renderConfig(connect), scopes: renderScopes(connect, oauth, reasons) };
}

/** Runs the generator. Returns the process exit code. */
export function run(argv, log = console.log) {
  const { flags, positional } = parseArgs(argv, ['--root']);
  const root = flags.get('--root') ?? REPO_ROOT;
  const check = flags.has('--check');
  const files = positional.length > 0 ? positional : DEFAULT_FILES;
  let rendered;
  try {
    rendered = renderAll(root);
  } catch (error) {
    log(`gen-config-table: ${error.message}`);
    return 1;
  }
  let failures = 0;
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) {
      log(`MISSING ${file}`);
      failures += 1;
      continue;
    }
    const before = readFileSync(path, 'utf8');
    let after;
    let names;
    try {
      ({ text: after, names } = replaceBlocks(before, rendered));
    } catch (error) {
      log(`ERROR ${file}: ${error.message}`);
      failures += 1;
      continue;
    }
    if (names.length === 0) {
      log(`NO-BLOCKS ${file}: no <!-- gen:begin config|scopes --> marker found`);
      failures += 1;
      continue;
    }
    if (after === before) continue;
    if (check) {
      const sources = [...new Set(names.flatMap((n) => BLOCK_SOURCES[n]))].join(', ');
      log(`DRIFT ${file}: generated block(s) ${names.join(', ')} differ from ${sources}; run node scripts/docs/gen-config-table.mjs`);
      failures += 1;
    } else {
      writeFileSync(path, after);
      log(`updated ${file} (${names.join(', ')})`);
    }
  }
  if (failures === 0) log(check ? 'gen-config-table: ok' : 'gen-config-table: done');
  return failures === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run(process.argv.slice(2)));
}
