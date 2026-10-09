/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkApplications,
  checkConfigKeys,
  checkMcScopes,
  checkScopes,
  checkVersionPins,
} from '../check-connect-layout.mjs';

const k = (key, extra = {}) => ({ key, description: `desc ${key}`, ...extra });
const URL_DEFAULT = 'https://not-configured.invalid/service';

function canonical() {
  const mc = (idKey, entryKey) => ({
    standardConfiguration: [
      k(idKey, { required: true }),
      ...(entryKey ? [k(entryKey, { required: true })] : []),
      k('CLOUD_IDENTIFIER', { default: 'gcp-us' }),
      k('CHAT_SERVICE_ENDPOINT_URL', { required: false, default: URL_DEFAULT }),
    ],
  });
  return {
    deployAs: [
      {
        name: 'service',
        applicationType: 'service',
        endpoint: '/service',
        scripts: {
          postDeploy: 'npm ci && npm run build && npm run connector:post-deploy',
          preUndeploy: 'npm ci && npm run build && npm run connector:pre-undeploy',
        },
        configuration: {
          standardConfiguration: [
            k('CTP_REGION', { required: true }),
            k('MC_CLOUD_IDENTIFIER', { required: false }),
            k('MC_APP_ENTRY_POINT_URI_PATH', { default: 'ai-assistant' }),
            k('MC_AUDIENCE', { required: false }),
            k('GCP_PROJECT_ID', { required: false }),
            k('GCP_VERTEX_LOCATION', { default: 'us-central1' }),
            k('GEMINI_MODEL_NAME', { default: 'model-a' }),
            k('GEMINI_LITE_MODEL_NAME', { default: 'model-b' }),
            k('GCP_BIGQUERY_DATASET_ID', { default: 'aiassistant' }),
            k('GCP_BIGQUERY_LOCATION', { default: 'us-central1' }),
            k('GCP_BUCKET_NAME', { required: false }),
            k('GCP_BUCKET_LOCATION', { default: 'us-central1' }),
            k('IMAGE_URL_MODE', { default: 'private' }),
            k('MCP_TOOLS_TTL_MS', { default: '1800000' }),
            k('LOG_LEVEL', { default: 'info' }),
            k('ADMIN_USER_IDS', { required: false }),
            k('CONTENTSTACK_BRANCH', { required: false }),
            k('CONTENTSTACK_REGION', { default: 'na' }),
            k('STRIPE_CONNECTED_ACCOUNT_ID', { required: false }),
          ],
          securedConfiguration: [
            k('GCP_SA_KEY_BASE64', { required: true }),
            k('ENCRYPTION_KEY', { required: true }),
            k('CONTENTSTACK_API_KEY', { required: false }),
            k('CONTENTSTACK_MANAGEMENT_TOKEN', { required: false }),
            k('ALGOLIA_MCP_URL', { required: false }),
            k('STRIPE_SECRET_KEY', { required: false }),
          ],
        },
      },
      { name: 'mc-app', applicationType: 'merchant-center-custom-application', configuration: mc('CUSTOM_APPLICATION_ID', 'ENTRY_POINT_URI_PATH') },
      { name: 'composed-apps', applicationType: 'merchant-center-custom-application', configuration: mc('CUSTOM_APPLICATION_ID', 'ENTRY_POINT_URI_PATH') },
      { name: 'mc-view-app', applicationType: 'merchant-center-custom-view', configuration: mc('CUSTOM_VIEW_ID') },
    ],
    inheritAs: { apiClient: { scopes: ['view_key_value_documents', 'manage_key_value_documents'] } },
  };
}

const service = (doc) => doc.deployAs[0].configuration;
const FOLDERS = { withPackageJson: ['service', 'mc-app', 'composed-apps', 'mc-view-app', 'scripts'], rootPackageJson: false };

test('layout: accepts the canonical document', () => {
  const doc = canonical();
  assert.deepEqual(checkApplications(doc, FOLDERS), []);
  assert.deepEqual(checkConfigKeys(doc), []);
  assert.deepEqual(checkScopes(doc), []);
});

test('layout: rejects missing application', () => {
  const doc = canonical();
  doc.deployAs.pop();
  assert.ok(checkApplications(doc, FOLDERS).some((e) => e.includes('exactly')));
});

test('layout: rejects endpoint on mc-app', () => {
  const doc = canonical();
  doc.deployAs[1].endpoint = '/mc';
  assert.ok(checkApplications(doc, FOLDERS).some((e) => e.includes('mc-app') && e.includes('endpoint')));
});

test('keys: rejects CTP_CLIENT_ID in service', () => {
  const doc = canonical();
  service(doc).standardConfiguration.push(k('CTP_CLIENT_ID'));
  assert.ok(checkConfigKeys(doc).some((e) => e.includes('CTP_CLIENT_ID') && e.includes('inheritAs.apiClient')));
});

test('keys: secured placement of GCP_SA_KEY_BASE64', () => {
  const doc = canonical();
  assert.deepEqual(checkConfigKeys(doc), []);
  // GCP_SA_KEY_BASE64 moved to standard
  const moved = canonical();
  service(moved).securedConfiguration = service(moved).securedConfiguration.filter((x) => x.key !== 'GCP_SA_KEY_BASE64');
  service(moved).standardConfiguration.push(k('GCP_SA_KEY_BASE64', { required: true }));
  assert.ok(checkConfigKeys(moved).some((e) => e.includes('GCP_SA_KEY_BASE64')));
  // every other GCP_* key and IMAGE_URL_MODE is standard and optional or defaulted
  for (const key of ['GCP_PROJECT_ID', 'GCP_VERTEX_LOCATION', 'GCP_BIGQUERY_DATASET_ID', 'GCP_BIGQUERY_LOCATION', 'GCP_BUCKET_NAME', 'GCP_BUCKET_LOCATION', 'IMAGE_URL_MODE']) {
    const bad = canonical();
    const found = service(bad).standardConfiguration.find((x) => x.key === key);
    delete found.default;
    found.required = true;
    assert.ok(checkConfigKeys(bad).some((e) => e.includes(key)), key);
  }
  // legacy name
  const legacy = canonical();
  service(legacy).standardConfiguration.push(k('GCP_LOCATION', { default: 'us-central1' }));
  assert.ok(checkConfigKeys(legacy).some((e) => e.includes('GCP_LOCATION')));
});

test('keys: provider secrets only under securedConfiguration', () => {
  for (const key of ['CONTENTSTACK_API_KEY', 'CONTENTSTACK_MANAGEMENT_TOKEN', 'ALGOLIA_MCP_URL', 'STRIPE_SECRET_KEY']) {
    const doc = canonical();
    service(doc).securedConfiguration = service(doc).securedConfiguration.filter((x) => x.key !== key);
    service(doc).standardConfiguration.push(k(key, { required: false }));
    assert.ok(checkConfigKeys(doc).some((e) => e.includes(key) && e.includes('securedConfiguration')), key);
  }
});

test('keys: provider non-secrets only under standardConfiguration', () => {
  const doc = canonical();
  service(doc).standardConfiguration = service(doc).standardConfiguration.filter((x) => x.key !== 'CONTENTSTACK_REGION');
  service(doc).securedConfiguration.push(k('CONTENTSTACK_REGION', { default: 'na' }));
  assert.ok(checkConfigKeys(doc).some((e) => e.includes('CONTENTSTACK_REGION') && e.includes('standardConfiguration')));
});

test('keys: ADMIN_USER_IDS optional and standard only', () => {
  const secured = canonical();
  service(secured).standardConfiguration = service(secured).standardConfiguration.filter((x) => x.key !== 'ADMIN_USER_IDS');
  service(secured).securedConfiguration.push(k('ADMIN_USER_IDS', { required: false }));
  assert.ok(checkConfigKeys(secured).some((e) => e.includes('ADMIN_USER_IDS')));

  const onApp = canonical();
  onApp.deployAs[1].configuration.standardConfiguration.push(k('ADMIN_USER_IDS', { required: false }));
  assert.ok(checkConfigKeys(onApp).some((e) => e.includes('ADMIN_USER_IDS') && e.includes('mc-app')));

  const required = canonical();
  service(required).standardConfiguration.find((x) => x.key === 'ADMIN_USER_IDS').required = true;
  assert.ok(checkConfigKeys(required).some((e) => e.includes('ADMIN_USER_IDS') && e.includes('required: false')));
});

test('mcscopes: requires view/manage mcp scopes and rejects additionalOAuthScopes', () => {
  const good = `const config = {
  oAuthScopes: {
    view: ['view_key_value_documents', 'view_mcp_servers'],
    manage: ['manage_key_value_documents', 'manage_mcp_servers'],
  },
};`;
  assert.deepEqual(checkMcScopes([{ file: 'a.mjs', text: good }]), []);
  const commented = `// additionalOAuthScopes is not used\n${good}`;
  assert.deepEqual(checkMcScopes([{ file: 'a.mjs', text: commented }]), []);
  const missing = good.replace("'view_mcp_servers'", "'view_stores'");
  assert.ok(checkMcScopes([{ file: 'a.mjs', text: missing }]).some((e) => e.includes('view_mcp_servers')));
  const extra = `${good}\nconst x = { additionalOAuthScopes: [] };`;
  assert.ok(checkMcScopes([{ file: 'a.mjs', text: extra }]).some((e) => e.includes('a.mjs') && e.includes('additionalOAuthScopes')));
});

test('scopes: rejects manage_project', () => {
  const doc = canonical();
  doc.inheritAs.apiClient.scopes.push('manage_project');
  assert.ok(checkScopes(doc).some((e) => e.includes('manage_project')));
});

test('pins: rejects drift 25.1.0 vs 27.9.6', () => {
  const pkg = (v) => ({ dependencies: { '@commercetools-frontend/application-shell': v } });
  const errors = checkVersionPins({ 'mc-app': pkg('27.9.6'), 'composed-apps': pkg('25.1.0'), 'mc-view-app': pkg('27.9.6') });
  assert.ok(errors.some((e) => e.includes('drift') && e.includes('25.1.0') && e.includes('27.9.6')));
  assert.deepEqual(checkVersionPins({ 'mc-app': pkg('27.9.6'), 'composed-apps': pkg('27.9.6') }), []);
});

test('pins: rejects caret', () => {
  const pkg = (v) => ({ dependencies: { '@commercetools-frontend/application-shell': v } });
  const errors = checkVersionPins({ 'mc-app': pkg('^27.9.6') });
  assert.ok(errors.some((e) => e.includes('pinned exactly')));
});
