/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  CONFIGURABLE_KEYS,
  GCP_SETTING_KEYS,
  MissingEnvError,
  NotConfigurableError,
  PROVIDER_KEYS,
  configureArgs,
  loadEnv,
  maskArgs,
  phase1Args,
  phase2Args,
  redact,
} from '../connect/lib/config.mjs';
import { parseEnvFile, mergeEnv, parseSince } from '../connect/lib/envfile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const BASE = {
  CONNECT_REGION: 'us-central1.gcp',
  GCP_SA_KEY_BASE64: 'c2E9PQ==',
  ENCRYPTION_KEY: 'ZW5jPQ==',
  MC_APP_CUSTOM_APPLICATION_ID: 'app-1',
  COMPOSED_APPS_CUSTOM_APPLICATION_ID: 'app-2',
  MC_VIEW_CUSTOM_VIEW_ID: 'view-1',
};
const env = (extra = {}) => loadEnv({ ...BASE, ...extra });

test('phase1: maps env to application keys', () => {
  const args = phase1Args(env());
  assert.ok(args.includes('service.GCP_SA_KEY_BASE64=c2E9PQ=='));
  assert.ok(args.includes('service.ENCRYPTION_KEY=ZW5jPQ=='), 'the value keeps its = padding');
  assert.ok(args.includes('service.CTP_REGION=us-central1.gcp'));
  assert.ok(args.includes('mc-app.CUSTOM_APPLICATION_ID=app-1'));
  assert.ok(args.includes('mc-app.ENTRY_POINT_URI_PATH=ai-assistant'));
  assert.ok(args.includes('mc-app.CLOUD_IDENTIFIER=gcp-us'));
  assert.ok(args.includes('composed-apps.CUSTOM_APPLICATION_ID=app-2'));
  assert.ok(args.includes('composed-apps.ENTRY_POINT_URI_PATH=ai-assistant-pages'));
  assert.ok(args.includes('mc-view-app.CUSTOM_VIEW_ID=view-1'));
  assert.ok(args.includes('mc-view-app.CLOUD_IDENTIFIER=gcp-us'));
  assert.ok(!args.some((a) => a.startsWith('mc-view-app.ENTRY_POINT_URI_PATH')), 'views have no entry point path');
});

test('phase1: derives the cloud identifier from the region', () => {
  const args = phase1Args(env({ CONNECT_REGION: 'europe-west1.gcp' }));
  assert.ok(args.includes('mc-app.CLOUD_IDENTIFIER=gcp-eu'));
  assert.throws(() => phase1Args(env({ CONNECT_REGION: 'mars-1.gcp' })), /unknown Connect region/);
});

test('phase1: omits MC_AUDIENCE and CHAT_SERVICE_ENDPOINT_URL', () => {
  const joined = phase1Args(env()).join('\n');
  assert.ok(!joined.includes('MC_AUDIENCE'));
  assert.ok(!joined.includes('CHAT_SERVICE_ENDPOINT_URL'));
});

test('phase1: provider keys only when set', () => {
  const none = phase1Args(env());
  for (const k of PROVIDER_KEYS) assert.ok(!none.some((a) => a.startsWith(`service.${k}=`)), k);
  const one = phase1Args(env({ STRIPE_SECRET_KEY: 'sk_x', CONTENTSTACK_REGION: '' }));
  assert.ok(one.includes('service.STRIPE_SECRET_KEY=sk_x'));
  assert.equal(one.filter((a) => /^service\.(CONTENTSTACK|ALGOLIA|STRIPE)/.test(a)).length, 1);
});

test('phase1: google settings only when set', () => {
  const some = phase1Args(env({ GCP_VERTEX_LOCATION: 'europe-west4', IMAGE_URL_MODE: '' }));
  assert.ok(some.includes('service.GCP_VERTEX_LOCATION=europe-west4'));
  for (const k of GCP_SETTING_KEYS.filter((k) => k !== 'GCP_VERTEX_LOCATION')) {
    assert.ok(!some.some((a) => a.startsWith(`service.${k}=`)), k);
  }
});

test('phase1: ADMIN_USER_IDS only when set and kept as one item with its commas', () => {
  assert.ok(!phase1Args(env()).some((a) => a.startsWith('service.ADMIN_USER_IDS')));
  assert.ok(!phase1Args(env({ ADMIN_USER_IDS: '' })).some((a) => a.startsWith('service.ADMIN_USER_IDS')));
  const items = phase1Args(env({ ADMIN_USER_IDS: 'id-a,id-b' })).filter((a) => a.startsWith('service.ADMIN_USER_IDS'));
  assert.deepEqual(items, ['service.ADMIN_USER_IDS=id-a,id-b']);
  assert.deepEqual(maskArgs(items), items, 'the allowlist is standard configuration and not masked');
});

test('phase1: every passed key is declared by connect.yaml for that application', () => {
  const doc = parse(readFileSync(join(ROOT, 'connect.yaml'), 'utf8'));
  const declared = new Map(
    doc.deployAs.map((a) => [
      a.name,
      new Set(
        [...(a.configuration?.standardConfiguration ?? []), ...(a.configuration?.securedConfiguration ?? [])].map((i) => i.key)
      ),
    ])
  );
  const all = [
    ...phase1Args(
      env({
        ADMIN_USER_IDS: 'a',
        ...Object.fromEntries([...GCP_SETTING_KEYS, ...PROVIDER_KEYS].map((k) => [k, 'x'])),
      })
    ),
    ...phase2Args({ origin: 'https://s.example' }),
  ];
  for (const item of all) {
    const [app, key] = item.slice(0, item.indexOf('=')).split('.');
    assert.ok(declared.get(app)?.has(key), `${app}.${key} is not declared in connect.yaml`);
  }
});

test('phase2: exactly three keys', () => {
  const args = phase2Args({ origin: 'https://service-abc.us-central1.gcp.commercetools.app' });
  assert.deepEqual(args, [
    'service.MC_AUDIENCE=https://service-abc.us-central1.gcp.commercetools.app',
    'mc-app.CHAT_SERVICE_ENDPOINT_URL=https://service-abc.us-central1.gcp.commercetools.app/service',
    'mc-view-app.CHAT_SERVICE_ENDPOINT_URL=https://service-abc.us-central1.gcp.commercetools.app/service',
  ]);
});

test('mask: hides secured values', () => {
  const masked = maskArgs(phase1Args(env()));
  assert.ok(masked.includes('service.GCP_SA_KEY_BASE64=***'));
  assert.ok(masked.includes('service.ENCRYPTION_KEY=***'));
  assert.ok(!masked.join('\n').includes('c2E9PQ'));
  assert.ok(masked.includes('mc-app.CUSTOM_APPLICATION_ID=app-1'), 'standard values stay readable');
});

test('mask: hides provider secrets', () => {
  const items = [
    'service.CONTENTSTACK_API_KEY=a1',
    'service.CONTENTSTACK_MANAGEMENT_TOKEN=a2',
    'service.ALGOLIA_MCP_URL=https://x.example/?k=1',
    'service.STRIPE_SECRET_KEY=a3',
    'service.CONTENTSTACK_REGION=eu',
    'service.STRIPE_CONNECTED_ACCOUNT_ID=acct_1',
  ];
  assert.deepEqual(maskArgs(items), [
    'service.CONTENTSTACK_API_KEY=***',
    'service.CONTENTSTACK_MANAGEMENT_TOKEN=***',
    'service.ALGOLIA_MCP_URL=***',
    'service.STRIPE_SECRET_KEY=***',
    'service.CONTENTSTACK_REGION=eu',
    'service.STRIPE_CONNECTED_ACCOUNT_ID=acct_1',
  ]);
});

test('redact: removes known secret values from free text', () => {
  const e = { GCP_SA_KEY_BASE64: 'c2VjcmV0LXZhbHVl' };
  assert.equal(redact('before c2VjcmV0LXZhbHVl after', e), 'before *** after');
});

test('configure: only allow-listed keys', () => {
  assert.deepEqual(configureArgs(['STRIPE_SECRET_KEY=sk_x', 'CONTENTSTACK_REGION=eu']), [
    'service.STRIPE_SECRET_KEY=sk_x',
    'service.CONTENTSTACK_REGION=eu',
  ]);
  assert.throws(() => configureArgs(['GCP_SA_KEY_BASE64=y']), NotConfigurableError);
  assert.throws(() => configureArgs(['ENCRYPTION_KEY=y']), NotConfigurableError);
  assert.throws(() => configureArgs(['CTP_REGION=y']), /CTP_REGION/);
  assert.equal(CONFIGURABLE_KEYS.length, 15);
});

test('configure: accepts ADMIN_USER_IDS', () => {
  assert.deepEqual(configureArgs(['ADMIN_USER_IDS=id-a,id-b']), ['service.ADMIN_USER_IDS=id-a,id-b']);
});

test('configure: splits on the first = only', () => {
  assert.deepEqual(configureArgs(['ALGOLIA_MCP_URL=https://x.example/?a=b=']), ['service.ALGOLIA_MCP_URL=https://x.example/?a=b=']);
});

test('configure: refuses empty value', () => {
  assert.throws(() => configureArgs(['STRIPE_SECRET_KEY=']), /Connect configuration/);
  assert.throws(() => configureArgs([]), /at least one/);
});

test('env: lists every missing name', () => {
  assert.throws(
    () => loadEnv({}),
    (error) =>
      error instanceof MissingEnvError &&
      ['GCP_SA_KEY_BASE64', 'ENCRYPTION_KEY', 'MC_APP_CUSTOM_APPLICATION_ID', 'COMPOSED_APPS_CUSTOM_APPLICATION_ID', 'MC_VIEW_CUSTOM_VIEW_ID'].every((n) =>
        error.names.includes(n)
      )
  );
});

test('env: defaults fill region, keys and entry points', () => {
  const e = loadEnv(BASE);
  assert.equal(e.DEPLOYMENT_TYPE, 'sandbox');
  assert.equal(e.MC_APP_ENTRY_POINT_URI_PATH, 'ai-assistant');
});

test('envfile: parses without evaluating and never overrides the real environment', () => {
  const parsed = parseEnvFile('# c\nA=1\nB="two words"\nC=x=y=\nbad line\nD=$(echo no)\n');
  assert.deepEqual(parsed, { A: '1', B: 'two words', C: 'x=y=', D: '$(echo no)' });
  assert.deepEqual(mergeEnv({ A: 'real', E: '' }, { A: 'file', E: 'file' }), { A: 'real', E: 'file' });
  assert.equal(parseSince('2h'), 7_200_000);
  assert.equal(parseSince('soon'), undefined);
});
