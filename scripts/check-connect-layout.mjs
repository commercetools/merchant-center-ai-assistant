/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Enforces the connect-skeleton rules that `commercetools connect validate` does not:
// application names/types, config-key placement, least-privilege scopes, Merchant Center
// scope lists and the single pinned @commercetools-frontend/* version.
// Pure functions return arrays of error strings; the CLI part at the bottom loads files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

export const EXPECTED_APPLICATIONS = [
  { name: 'service', applicationType: 'service' },
  { name: 'mc-app', applicationType: 'merchant-center-custom-application' },
  { name: 'composed-apps', applicationType: 'merchant-center-custom-application' },
  { name: 'mc-view-app', applicationType: 'merchant-center-custom-view' },
];

export const ALLOWED_SCOPES = ['view_key_value_documents', 'manage_key_value_documents'];

export const INJECTED_KEYS = [
  'CTP_API_URL',
  'CTP_AUTH_URL',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_PROJECT_KEY',
  'CTP_SCOPE',
];

const PLACEHOLDER_URL = 'https://not-configured.invalid/service';

// key -> expectation. `default` = exact default value; `optional` = required must be false.
const SERVICE_STANDARD = {
  CTP_REGION: { required: true },
  MC_CLOUD_IDENTIFIER: { optional: true },
  MC_APP_ENTRY_POINT_URI_PATH: { default: 'ai-assistant' },
  MC_AUDIENCE: { optional: true },
  GCP_PROJECT_ID: { optional: true },
  GCP_VERTEX_LOCATION: { default: 'us-central1' },
  GEMINI_MODEL_NAME: { hasDefault: true },
  GEMINI_AGENT_MODEL_NAME: { hasDefault: true },
  GEMINI_LITE_MODEL_NAME: { hasDefault: true },
  GEMINI_LITE_THINKING_LEVEL: { default: 'minimal' },
  GEMINI_IMAGE_MODEL_NAME: { hasDefault: true },
  GCP_BIGQUERY_DATASET_ID: { default: 'aiassistant' },
  GCP_BIGQUERY_LOCATION: { default: 'us-central1' },
  GCP_BUCKET_NAME: { optional: true },
  GCP_BUCKET_LOCATION: { default: 'us-central1' },
  IMAGE_URL_MODE: { default: 'private' },
  MCP_TOOLS_TTL_MS: { default: '1800000' },
  PERSISTENCE_CONCURRENCY: { default: '8' },
  SETTINGS_CACHE_TTL_MS: { default: '5000' },
  CHAT_REQUEST_BUDGET_MS: { default: '270000' },
  CHAT_FINALIZE_RESERVE_MS: { default: '30000' },
  NIMBUS_MCP_ENABLED: { default: 'true' },
  LOG_LEVEL: { default: 'info' },
  ADMIN_USER_IDS: { optional: true },
  CONTENTSTACK_BRANCH: { optional: true },
  CONTENTSTACK_REGION: { default: 'na' },
  STRIPE_CONNECTED_ACCOUNT_ID: { optional: true },
};

const SERVICE_SECURED = {
  GCP_SA_KEY_BASE64: { required: true },
  ENCRYPTION_KEY: { required: true },
  ENCRYPTION_KEY_PREVIOUS: { optional: true },
  CONTENTSTACK_API_KEY: { optional: true },
  CONTENTSTACK_MANAGEMENT_TOKEN: { optional: true },
  ALGOLIA_MCP_URL: { optional: true },
  STRIPE_SECRET_KEY: { optional: true },
};

const MC_STANDARD = {
  CUSTOM_APPLICATION_ID: { required: true },
  ENTRY_POINT_URI_PATH: { required: true },
  CLOUD_IDENTIFIER: { default: 'gcp-us' },
  CHAT_SERVICE_ENDPOINT_URL: { optional: true, default: PLACEHOLDER_URL },
};

// The Pages app reads composed pages straight from commercetools and makes no service calls.
const COMPOSED_STANDARD = {
  CUSTOM_APPLICATION_ID: { required: true },
  ENTRY_POINT_URI_PATH: { required: true },
  CLOUD_IDENTIFIER: { default: 'gcp-us' },
};

const VIEW_STANDARD = {
  CUSTOM_VIEW_ID: { required: true },
  CLOUD_IDENTIFIER: { default: 'gcp-us' },
  CHAT_SERVICE_ENDPOINT_URL: { optional: true, default: PLACEHOLDER_URL },
};

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD)|_KEY(_BASE64)?$/;

const list = (value) => (Array.isArray(value) ? value : []);

function entry(doc, name) {
  return list(doc?.deployAs).find((d) => d?.name === name);
}

function keysOf(app, section) {
  return list(app?.configuration?.[section]);
}

/** Names, types, order, folders and forbidden keys on the Merchant Center entries. */
export function checkApplications(doc, folders = {}) {
  const errors = [];
  const apps = list(doc?.deployAs);
  const actual = apps.map((d) => `${d?.name}:${d?.applicationType}`).join(',');
  const expected = EXPECTED_APPLICATIONS.map((d) => `${d.name}:${d.applicationType}`).join(',');
  if (actual !== expected) {
    errors.push(`deployAs must be exactly [${expected}] in this order, found [${actual}]`);
  }
  const service = entry(doc, 'service');
  if (service && service.endpoint !== '/service') {
    errors.push('service: endpoint must be /service');
  }
  if (service) {
    const scripts = service.scripts ?? {};
    if (!String(scripts.postDeploy ?? '').includes('connector:post-deploy')) {
      errors.push('service: scripts.postDeploy must run connector:post-deploy');
    }
    if (!String(scripts.preUndeploy ?? '').includes('connector:pre-undeploy')) {
      errors.push('service: scripts.preUndeploy must run connector:pre-undeploy');
    }
  }
  for (const name of ['mc-app', 'composed-apps', 'mc-view-app']) {
    const app = entry(doc, name);
    if (!app) continue;
    if ('endpoint' in app) errors.push(`${name}: must not declare endpoint`);
    if (app.configuration && 'securedConfiguration' in app.configuration) {
      errors.push(`${name}: must not declare securedConfiguration`);
    }
    const all = [...keysOf(app, 'standardConfiguration'), ...keysOf(app, 'securedConfiguration')];
    if (all.some((k) => k?.key === 'APPLICATION_URL')) {
      errors.push(`${name}: must not declare APPLICATION_URL (Connect injects it)`);
    }
  }
  const names = EXPECTED_APPLICATIONS.map((d) => d.name);
  for (const name of names) {
    if (!folders.withPackageJson?.includes(name) && folders.withPackageJson) {
      errors.push(`${name}: root folder with a package.json is missing`);
    }
  }
  for (const folder of folders.withPackageJson ?? []) {
    if (folder !== 'scripts' && !names.includes(folder)) {
      errors.push(`${folder}: unexpected root folder with a package.json`);
    }
  }
  if (folders.rootPackageJson) errors.push('a root package.json must not exist (no workspaces root)');
  return errors;
}

function checkSection(appName, section, keys, table, errors) {
  const byKey = new Map(keys.map((k) => [k?.key, k]));
  for (const [key, rule] of Object.entries(table)) {
    const k = byKey.get(key);
    if (!k) {
      errors.push(`${appName}: missing ${section} key ${key}`);
      continue;
    }
    if (!k.description || !String(k.description).trim()) {
      errors.push(`${appName}: ${key} needs a non-empty description`);
    }
    if (rule.required && k.required !== true) errors.push(`${appName}: ${key} must be required: true`);
    if (rule.optional && k.required !== false) errors.push(`${appName}: ${key} must be required: false`);
    if (rule.default !== undefined && k.default !== rule.default) {
      errors.push(`${appName}: ${key} default must be '${rule.default}'`);
    }
    if (rule.hasDefault && (k.default === undefined || k.default === '')) {
      errors.push(`${appName}: ${key} needs a default`);
    }
  }
  for (const k of keys) {
    if (!(k?.key in table)) errors.push(`${appName}: unexpected ${section} key ${k?.key}`);
  }
}

/** Placement, required flags and defaults of every configuration key. */
export function checkConfigKeys(doc) {
  const errors = [];
  const service = entry(doc, 'service');
  const all = list(doc?.deployAs).flatMap((app) => [
    ...keysOf(app, 'standardConfiguration').map((k) => [app.name, 'standardConfiguration', k]),
    ...keysOf(app, 'securedConfiguration').map((k) => [app.name, 'securedConfiguration', k]),
  ]);

  for (const [appName, section, k] of all) {
    if (INJECTED_KEYS.includes(k?.key)) {
      errors.push(`${appName}: ${k.key} must not be declared, Connect injects it through inheritAs.apiClient`);
    }
    if (k?.key === 'GCP_LOCATION') {
      errors.push(`${appName}: GCP_LOCATION is the legacy name, use GCP_VERTEX_LOCATION`);
    }
    if (section === 'standardConfiguration' && SECRET_NAME.test(k?.key ?? '')) {
      errors.push(`${appName}: ${k.key} looks like a secret and must be under securedConfiguration, not standardConfiguration`);
    }
    if (k?.key === 'ADMIN_USER_IDS' && (appName !== 'service' || section !== 'standardConfiguration')) {
      errors.push(`${appName}: ADMIN_USER_IDS belongs only under service standardConfiguration (found under ${section})`);
    }
    if (k?.key in SERVICE_SECURED && appName === 'service' && section !== 'securedConfiguration') {
      errors.push(`service: ${k.key} must be under securedConfiguration, found under ${section}`);
    }
    if (k?.key in SERVICE_STANDARD && appName === 'service' && section !== 'standardConfiguration') {
      errors.push(`service: ${k.key} must be under standardConfiguration, found under ${section}`);
    }
  }

  if (service) {
    checkSection('service', 'standardConfiguration', keysOf(service, 'standardConfiguration'), SERVICE_STANDARD, errors);
    checkSection('service', 'securedConfiguration', keysOf(service, 'securedConfiguration'), SERVICE_SECURED, errors);
  }
  const mcApp = entry(doc, 'mc-app');
  if (mcApp) checkSection('mc-app', 'standardConfiguration', keysOf(mcApp, 'standardConfiguration'), MC_STANDARD, errors);
  const composed = entry(doc, 'composed-apps');
  if (composed) checkSection('composed-apps', 'standardConfiguration', keysOf(composed, 'standardConfiguration'), COMPOSED_STANDARD, errors);
  const view = entry(doc, 'mc-view-app');
  if (view) checkSection('mc-view-app', 'standardConfiguration', keysOf(view, 'standardConfiguration'), VIEW_STANDARD, errors);
  // Dedupe (a misplaced key is reported by both the placement and the table pass).
  return [...new Set(errors)];
}

/** inheritAs.apiClient.scopes is the one connector-wide, least-privilege list. */
export function checkScopes(doc) {
  const errors = [];
  const scopes = doc?.inheritAs?.apiClient?.scopes;
  if (!Array.isArray(scopes)) return ['inheritAs.apiClient.scopes is missing'];
  if (scopes.includes('manage_project')) errors.push('inheritAs.apiClient.scopes must not contain manage_project');
  for (const scope of scopes) {
    if (!ALLOWED_SCOPES.includes(scope)) {
      errors.push(`inheritAs.apiClient.scopes: ${scope} is not in the allowed list (${ALLOWED_SCOPES.join(', ')}); a later change must add it here together with its justification`);
    }
  }
  for (const scope of ALLOWED_SCOPES) {
    if (!scopes.includes(scope)) errors.push(`inheritAs.apiClient.scopes: missing ${scope}`);
  }
  const perApp = list(doc?.deployAs).filter((d) => d && 'inheritAs' in d).map((d) => d.name);
  if (perApp.length) errors.push(`inheritAs is connector-wide, found on application(s): ${perApp.join(', ')}`);
  return errors;
}

function scopeList(text, which) {
  // Extract the array after `view:` / `manage:` inside oAuthScopes without evaluating the file.
  const block = text.match(/oAuthScopes:\s*\{([\s\S]*?)\n\s{2}\}/);
  if (!block) return null;
  const m = block[1].match(new RegExp(`${which}:\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
}

/** Each Merchant Center config file: plain mcp scopes (not the Pages app), no additionalOAuthScopes. */
export function checkMcScopes(files) {
  const errors = [];
  for (const { file, text: raw } of files) {
    // Comments may mention the forbidden key; only code counts.
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    if (text.includes('additionalOAuthScopes')) errors.push(`${file}: additionalOAuthScopes is not allowed`);
    const view = scopeList(text, 'view');
    const manage = scopeList(text, 'manage');
    // The Pages app has no Managed MCP surface and asks for no MCP scopes (change R).
    if (file.startsWith('composed-apps/')) continue;
    if (!view?.includes('view_mcp_servers')) errors.push(`${file}: oAuthScopes.view must contain view_mcp_servers`);
    if (!manage?.includes('manage_mcp_servers')) errors.push(`${file}: oAuthScopes.manage must contain manage_mcp_servers`);
  }
  return errors;
}

/** All @commercetools-frontend/* deps identical and exact; no workspaces field. */
export function checkVersionPins(packageJsons) {
  const errors = [];
  const seen = new Map();
  for (const [name, pkg] of Object.entries(packageJsons)) {
    if (pkg && 'workspaces' in pkg) errors.push(`${name}: workspaces field is not allowed`);
    if (name === 'service' || name === 'scripts') continue;
    const all = { ...pkg?.dependencies, ...pkg?.devDependencies };
    for (const [dep, version] of Object.entries(all)) {
      if (!dep.startsWith('@commercetools-frontend/')) continue;
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        errors.push(`${name}: ${dep} must be pinned exactly (found ${version})`);
      }
      seen.set(version, [...(seen.get(version) ?? []), `${name}:${dep}`]);
    }
  }
  if (seen.size > 1) {
    const summary = [...seen.entries()].map(([v, who]) => `${v} (${who.length} deps, e.g. ${who[0]})`).join(' vs ');
    errors.push(`@commercetools-frontend/* versions drift across apps: ${summary}`);
  }
  return errors;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const doc = parse(fs.readFileSync(path.join(root, 'connect.yaml'), 'utf8'));
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'node_modules');
  const withPackageJson = dirs.map((d) => d.name).filter((n) => fs.existsSync(path.join(root, n, 'package.json')));
  const folders = { withPackageJson, rootPackageJson: fs.existsSync(path.join(root, 'package.json')) };

  const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const packageJsons = Object.fromEntries(withPackageJson.map((n) => [n, readJson(`${n}/package.json`)]));

  const configFiles = [
    'mc-app/custom-application-config.mjs',
    'composed-apps/custom-application-config.mjs',
    'mc-view-app/custom-view-config.mjs',
  ].map((file) => ({ file, text: fs.readFileSync(path.join(root, file), 'utf8') }));

  const errors = [
    ...checkApplications(doc, folders),
    ...checkConfigKeys(doc),
    ...checkScopes(doc),
    ...checkMcScopes(configFiles),
    ...checkVersionPins(packageJsons),
  ];

  let tracked = [];
  try {
    tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  } catch {
    // not a git checkout: skip the tracked-.env check
  }
  for (const f of tracked) {
    if (/(^|\/)\.env(\.[^/]*)?$/.test(f) && !/\.example$/.test(f)) errors.push(`${f}: .env files must not be tracked`);
  }

  if (errors.length) {
    for (const e of errors) process.stderr.write(`ERROR ${e}\n`);
    process.exit(1);
  }
  process.stdout.write(`connect layout ok (${list(doc.deployAs).length} applications)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
