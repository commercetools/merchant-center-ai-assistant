/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConnectYaml, readOAuthScopes, renderConfig, replaceBlocks, run } from './gen-config-table.mjs';

const YAML = `deployAs:
  - name: service
    applicationType: service
    endpoint: /service
    configuration:
      standardConfiguration:
        - key: LOG_LEVEL
          description: Logger level | one of error, warn
          default: 'info'
        - key: ADMIN_USER_IDS
          description: Administrators
          required: false
      securedConfiguration:
        - key: ENCRYPTION_KEY
          description: Secret key
          required: true
          default: 'must-not-print'
inheritAs:
  apiClient:
    scopes:
      - view_key_value_documents
`;

const OAUTH = `const config = {
  // comment with [brackets] before the scopes
  oAuthScopes: {
    view: ['view_key_value_documents', 'view_products'],
    manage: [
      'manage_products', // trailing comment
    ],
  },
  icon: 'x',
};`;

function fixture(extraDoc = '') {
  const root = mkdtempSync(join(tmpdir(), 'gen-config-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'mc-app'));
  writeFileSync(join(root, 'connect.yaml'), YAML);
  writeFileSync(join(root, 'mc-app', 'custom-application-config.mjs'), OAUTH);
  writeFileSync(
    join(root, 'docs', 'scope-reasons.json'),
    JSON.stringify({ api: { view_key_value_documents: 'reads' }, oauth: {}, oauthDefault: 'because' })
  );
  const doc = `# Doc\n\n<!-- gen:begin config -->\nold\n<!-- gen:end config -->\n\n<!-- gen:begin scopes -->\nold\n<!-- gen:end scopes -->\n${extraDoc}`;
  writeFileSync(join(root, 'README.md'), doc);
  writeFileSync(join(root, 'docs', 'configuration.md'), doc);
  return root;
}

const quiet = () => {};

test('connect.yaml keys, kinds and defaults are read; secured defaults are never printed', () => {
  const text = renderConfig(readConnectYaml(YAML));
  assert.match(text, /\| `LOG_LEVEL` \| standard \| no \| `info` \| Logger level \\\| one of error, warn \|/);
  assert.match(text, /\| `ENCRYPTION_KEY` \| secured \| yes \|  \|/);
  assert.ok(!text.includes('must-not-print'));
});

test('oAuthScopes are read without comments', () => {
  assert.deepEqual(readOAuthScopes(OAUTH), { view: ['view_key_value_documents', 'view_products'], manage: ['manage_products'] });
});

test('replaceBlocks only touches the marked blocks and is idempotent', () => {
  const first = replaceBlocks('a\n<!-- gen:begin config -->\nx\n<!-- gen:end config -->\nb', { config: 'T', scopes: 'S' });
  assert.deepEqual(first.names, ['config']);
  assert.ok(first.text.startsWith('a\n') && first.text.endsWith('\nb'));
  assert.equal(replaceBlocks(first.text, { config: 'T' }).text, first.text);
});

test('generation writes the blocks and --check then passes', () => {
  const root = fixture();
  assert.equal(run(['--root', root], quiet), 0);
  const text = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(text, /\| `ADMIN_USER_IDS` \|/);
  assert.match(text, /\| `manage_products` \| manage \| `mc-app` \| because \|/);
  assert.equal(run(['--check', '--root', root], quiet), 0);
});

test('--check fails and names the file after a description changes in connect.yaml', () => {
  const root = fixture();
  assert.equal(run(['--root', root], quiet), 0);
  writeFileSync(join(root, 'connect.yaml'), YAML.replace('Administrators', 'Changed text'));
  const lines = [];
  assert.equal(run(['--check', '--root', root, 'README.md', 'docs/configuration.md'], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.startsWith('DRIFT README.md')));
  assert.ok(lines.some((l) => l.startsWith('DRIFT docs/configuration.md')));
});

test('--check fails when a scope is added to a config file', () => {
  const root = fixture();
  run(['--root', root], quiet);
  writeFileSync(join(root, 'mc-app', 'custom-application-config.mjs'), OAUTH.replace("'manage_products'", "'manage_products', 'manage_orders'"));
  const lines = [];
  assert.equal(run(['--check', '--root', root], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.includes('mc-app/custom-application-config.mjs')));
});

test('a scope without a reason is an error', () => {
  const root = fixture();
  writeFileSync(join(root, 'connect.yaml'), YAML.replace('- view_key_value_documents', '- view_unknown_scope'));
  const lines = [];
  assert.equal(run(['--root', root], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.includes('view_unknown_scope')));
});

test('a file without markers fails', () => {
  const root = fixture();
  writeFileSync(join(root, 'README.md'), '# nothing\n');
  assert.equal(run(['--check', '--root', root, 'README.md'], quiet), 1);
});
