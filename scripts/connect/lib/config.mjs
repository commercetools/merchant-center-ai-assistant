/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Environment -> `--configuration` arguments. The only module that decides which value goes
// to which application. Pure: no network, no process access.
import { cloudIdentifierFor } from './regions.mjs';

/** Optional Google Cloud settings (standard configuration of `service`). */
export const GCP_SETTING_KEYS = [
  'GCP_PROJECT_ID',
  'GCP_VERTEX_LOCATION',
  'GCP_BIGQUERY_DATASET_ID',
  'GCP_BIGQUERY_LOCATION',
  'GCP_BUCKET_NAME',
  'GCP_BUCKET_LOCATION',
  'IMAGE_URL_MODE',
];

/** Optional third-party provider keys (maintainer decision Q4). */
export const PROVIDER_KEYS = [
  'CONTENTSTACK_API_KEY',
  'CONTENTSTACK_MANAGEMENT_TOKEN',
  'CONTENTSTACK_BRANCH',
  'CONTENTSTACK_REGION',
  'ALGOLIA_MCP_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_CONNECTED_ACCOUNT_ID',
];

/** Keys that are secured configuration: their value is replaced by *** in everything printed. */
export const SECURED_KEYS = [
  'GCP_SA_KEY_BASE64',
  'ENCRYPTION_KEY',
  'CONTENTSTACK_API_KEY',
  'CONTENTSTACK_MANAGEMENT_TOKEN',
  'ALGOLIA_MCP_URL',
  'STRIPE_SECRET_KEY',
];

/** What `configure` accepts. Never GCP_SA_KEY_BASE64 or ENCRYPTION_KEY (deploy-only). */
export const CONFIGURABLE_KEYS = [...PROVIDER_KEYS, ...GCP_SETTING_KEYS, 'ADMIN_USER_IDS'];

export const APPLICATIONS = ['service', 'mc-app', 'composed-apps', 'mc-view-app'];

export class MissingEnvError extends Error {
  constructor(names) {
    super(`missing required environment variable(s): ${names.join(', ')}`);
    this.name = 'MissingEnvError';
    this.names = names;
  }
}

export class NotConfigurableError extends Error {
  constructor(key) {
    super(`${key} is not configurable through this command`);
    this.name = 'NotConfigurableError';
    this.key = key;
  }
}

/** Defaults applied when a variable is unset or empty. */
const DEFAULTS = {
  CONNECT_REGION: 'us-central1.gcp',
  CONNECTOR_KEY: 'ai-assistant',
  CONNECTOR_NAME: 'AI Assistant',
  DEPLOYMENT_KEY: 'ai-assistant-sandbox',
  DEPLOYMENT_TYPE: 'sandbox',
  MC_APP_ENTRY_POINT_URI_PATH: 'ai-assistant',
  COMPOSED_APPS_ENTRY_POINT_URI_PATH: 'ai-assistant-pages',
};

/** Required names per command group. */
export const REQUIRED = {
  stage: ['CONNECTOR_KEY', 'CONNECTOR_NAME', 'CREATOR_EMAIL', 'REPO_URL', 'REPO_TAG', 'CONNECT_REGION'],
  publish: ['CONNECTOR_KEY'],
  deployment: ['CONNECT_REGION', 'DEPLOYMENT_KEY'],
  deploy: [
    'CONNECT_REGION',
    'CONNECTOR_KEY',
    'DEPLOYMENT_KEY',
    'GCP_SA_KEY_BASE64',
    'ENCRYPTION_KEY',
    'MC_APP_CUSTOM_APPLICATION_ID',
    'MC_APP_ENTRY_POINT_URI_PATH',
    'COMPOSED_APPS_CUSTOM_APPLICATION_ID',
    'COMPOSED_APPS_ENTRY_POINT_URI_PATH',
    'MC_VIEW_CUSTOM_VIEW_ID',
  ],
  api: ['CONNECT_REGION', 'CTP_PROJECT_KEY', 'CONNECT_CLIENT_ID', 'CONNECT_CLIENT_SECRET', 'DEPLOYMENT_KEY'],
};

function present(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Returns a normalised copy of `env` with defaults applied. Throws MissingEnvError listing
 * EVERY missing name of the requested groups (default: the `deploy` group).
 */
export function loadEnv(env, groups = ['deploy']) {
  const out = { ...env };
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (!present(out[name])) out[name] = value;
  }
  const missing = [];
  for (const group of groups) {
    for (const name of REQUIRED[group] ?? []) {
      if (!present(out[name]) && !missing.includes(name)) missing.push(name);
    }
  }
  if (missing.length > 0) throw new MissingEnvError(missing);
  return out;
}

/** Items for every key of `names` that is set and non-empty, as `service.KEY=value`. */
function serviceItems(env, names) {
  return names.filter((n) => present(env[n])).map((n) => `service.${n}=${env[n]}`);
}

/** Phase 1: everything except CHAT_SERVICE_ENDPOINT_URL (unknown until deployed). */
export function phase1Args(env) {
  const cloud = cloudIdentifierFor(env.CONNECT_REGION);
  return [
    `service.GCP_SA_KEY_BASE64=${env.GCP_SA_KEY_BASE64}`,
    `service.ENCRYPTION_KEY=${env.ENCRYPTION_KEY}`,
    // required standard configuration of the service; Connect does not inject it (connect.yaml)
    `service.CTP_REGION=${env.CONNECT_REGION}`,
    // the whole comma-separated list is ONE item; commas are part of the value
    ...serviceItems(env, ['ADMIN_USER_IDS']),
    ...serviceItems(env, GCP_SETTING_KEYS),
    ...serviceItems(env, PROVIDER_KEYS),
    `mc-app.CUSTOM_APPLICATION_ID=${env.MC_APP_CUSTOM_APPLICATION_ID}`,
    `mc-app.ENTRY_POINT_URI_PATH=${env.MC_APP_ENTRY_POINT_URI_PATH}`,
    `composed-apps.CUSTOM_APPLICATION_ID=${env.COMPOSED_APPS_CUSTOM_APPLICATION_ID}`,
    `composed-apps.ENTRY_POINT_URI_PATH=${env.COMPOSED_APPS_ENTRY_POINT_URI_PATH}`,
    // views have no entry point path (B PF5)
    `mc-view-app.CUSTOM_VIEW_ID=${env.MC_VIEW_CUSTOM_VIEW_ID}`,
    // inheritAs.configuration: one global item (no application prefix) reaches every application
    `CLOUD_IDENTIFIER=${cloud}`,
  ];
}

/**
 * Phase 2: exactly one item, no secured value. `origin` has no path. The endpoint is a global
 * item (inheritAs.configuration). The service needs nothing here: it takes its own audience
 * from CONNECT_SERVICE_URL.
 */
export function phase2Args({ origin }) {
  return [`CHAT_SERVICE_ENDPOINT_URL=${origin}/service`];
}

/** Splits `KEY=VALUE` on the FIRST `=` (values such as Base64 contain `=`). */
export function splitPair(text) {
  const eq = text.indexOf('=');
  if (eq < 1) return undefined;
  return [text.slice(0, eq), text.slice(eq + 1)];
}

/**
 * `configure` arguments: validates `KEY=VALUE` pairs against the allow-list and returns
 * `service.KEY=VALUE` items. Refuses empty values (clearing needs the Connect configuration).
 */
export function configureArgs(pairs) {
  if (pairs.length === 0) throw new Error('configure needs at least one KEY=VALUE');
  return pairs.map((pair) => {
    const split = splitPair(pair);
    if (!split) throw new Error(`not a KEY=VALUE pair: ${pair.split('=')[0]}`);
    const [key, value] = split;
    if (!CONFIGURABLE_KEYS.includes(key)) throw new NotConfigurableError(key);
    if (value === '') {
      throw new Error(
        `${key}: empty value refused; to clear a key remove it in the Connect configuration (see the deployment runbook)`
      );
    }
    return `service.${key}=${value}`;
  });
}

const MASKED = new Set(SECURED_KEYS);

/** Replaces the value of every secured `app.KEY=value` or global `KEY=value` item with ***. Other items pass through. */
export function maskArgs(args) {
  return args.map((arg) => {
    const m = /^(?:([a-z][a-z-]*)\.)?([A-Z][A-Z0-9_]*)=/.exec(arg);
    if (m && MASKED.has(m[2])) return `${m[1] ? `${m[1]}.` : ''}${m[2]}=***`;
    return arg;
  });
}

/** All secured values present in `env`, for last-resort redaction of captured output. */
export function secretValues(env) {
  return [...SECURED_KEYS, 'CONNECT_CLIENT_SECRET']
    .map((k) => env[k])
    .filter((v) => present(v) && v.length >= 4);
}

/** Replaces every occurrence of a known secret value in `text`. */
export function redact(text, env) {
  let out = String(text);
  for (const secret of secretValues(env)) out = out.split(secret).join('***');
  return out;
}
