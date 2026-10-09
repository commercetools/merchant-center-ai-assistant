/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { certify, citations, quotedPaths, run, scrubText, stale } from './check-docs-claims.mjs';

const TABLE = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
const CONNECT = `deployAs:
  - name: service
    applicationType: service
    configuration:
      standardConfiguration:
        - key: ADMIN_USER_IDS
          description: x
      securedConfiguration:
        - key: ENCRYPTION_KEY
          description: y
`;

const README = `> **UNSUPPORTED - commercetools Labs.** Reference code.

# Title

## Overview
text
## What it is not
text
## Architecture at a glance
text
## Repository layout
text
## Prerequisites
text
## Quick start (local)
text
## Deployment summary
text
## Configuration
<!-- gen:begin config -->
${TABLE}<!-- gen:end config -->
\`ADMIN_USER_IDS\` and \`ENCRYPTION_KEY\`.
## Administrator access
text
## Required scopes
<!-- gen:begin scopes -->
${TABLE}<!-- gen:end scopes -->
## Fail-open and fail-closed behaviour
${TABLE}
## Operations
text
## Poison messages and replay
Not applicable: no events.
## Testing
text
## Contributing
text
## Support
text
## License
text
`;

const OPERATIONS = `# Operations

## Fail-open and fail-closed behaviour
${TABLE}
## Poison messages and replay
Not applicable.
## Data retention
There is no automatic deletion.
`;

function tree(overrides = {}) {
  const files = {
    'README.md': README,
    'SUPPORT.md': '# Support\n\nUnsupported.\n',
    'CONTRIBUTING.md': '# C\n',
    'FEATURES.md': '# F\n',
    'CHANGELOG.md': '# Changelog\n',
    'connect.yaml': CONNECT,
    'docs/architecture.md': '# A\n',
    'docs/how-it-works.md': '# H\n',
    'docs/api.md': '# API\n',
    'docs/configuration.md': '# Configuration\n',
    'docs/deployment.md': '# D\n',
    'docs/permissions.md': '# P\n\nADMIN_USER_IDS, Your user ID, userLabel.\n',
    'docs/security.md': '# S\n',
    'docs/operations.md': OPERATIONS,
    'docs/troubleshooting.md': '# T\n\nNobody is an admin because ADMIN_USER_IDS is empty.\n\nI am not shown as administrator.\n',
    'docs/privacy.md': '# Privacy\n\nNo automatic deletion.\n',
    'service/src/app.ts': 'x',
    ...overrides,
  };
  const root = mkdtempSync(join(tmpdir(), 'claims-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('certify passes on a complete tree', () => {
  assert.deepEqual(certify(tree()), []);
});

test('certify reports a missing heading, an empty table and an undocumented key', () => {
  const broken = README.replace('## Required scopes', '## Scopes').replace(TABLE, '').replace('`ENCRYPTION_KEY`', '');
  const problems = certify(tree({ 'README.md': broken }));
  assert.ok(problems.some((p) => p.includes('Required scopes')));
  assert.ok(problems.some((p) => p.includes('configuration table')));
  assert.ok(problems.some((p) => p.includes('ENCRYPTION_KEY')));
});

test('certify requires the unsupported banner and the poison statement', () => {
  const problems = certify(tree({ 'README.md': README.replace('UNSUPPORTED', 'Notice').replace('Not applicable', 'Handled') }));
  assert.ok(problems.some((p) => p.startsWith('UNSUPPORTED README.md')));
  assert.ok(problems.some((p) => p.startsWith('README-POISON')));
});

test('quotedPaths only returns repository paths', () => {
  assert.deepEqual(quotedPaths('`service/src/app.ts` `/service/status` `a/b` `scripts/connect/.env.connect` `docs/<x>.md`'), ['service/src/app.ts']);
});

test('citations pass with an existing path or a documentation URL and fail otherwise', () => {
  const ok = tree({ 'docs/architecture.md': '# A\n\n## One\nSee `service/src/app.ts`.\n\n## Two\nhttps://docs.commercetools.com/connect/overview\n' });
  assert.deepEqual(citations(ok, ['docs/architecture.md']), []);
  const bad = tree({ 'docs/architecture.md': '# A\n\n## One\nNo citation.\n\n## Two\n`service/src/gone.ts`\n' });
  const problems = citations(bad, ['docs/architecture.md']);
  assert.ok(problems.some((p) => p.includes('cites no repository path')));
  assert.ok(problems.some((p) => p.includes('does not exist: service/src/gone.ts')));
});

test('scrub flags framing words, hosts, local paths, e-mail, emoji, tenant words', () => {
  const framing = ['de', 'mo'].join('');
  const host = ['ng', 'rok'].join('');
  const text = [`a ${framing} here`, `see x.${host}.io`, 'path /Users/someone/x', 'mail me@corp.test', 'fine me@example.com', 'party \u{1F389}', 'multitenant word'].join('\n');
  const problems = scrubText('README.md', text);
  for (const kind of ['FRAMING', 'HOST', 'LOCAL-PATH', 'EMAIL', 'EMOJI', 'TENANT']) {
    assert.ok(problems.some((p) => p.startsWith(`SCRUB-${kind}`)), kind);
  }
  assert.equal(problems.filter((p) => p.startsWith('SCRUB-EMAIL')).length, 1);
  assert.deepEqual(scrubText('CHANGELOG.md', 'the old multitenant system'), []);
  assert.deepEqual(scrubText('README.md', 'clean text about `ADMIN_USER_IDS`'), []);
});

test('scrub uses the leak list and internal paths when given', () => {
  const problems = scrubText('README.md', 'Acme Corp and .claude/x', { leaks: [/acme corp/i], internals: ['.claude/'] });
  assert.deepEqual(problems.map((p) => p.split(' ')[0]).sort(), ['SCRUB-INTERNAL', 'SCRUB-LEAK']);
});

test('stale finds removed vocabulary but not ADMIN_USER_IDS', () => {
  const root = tree({ 'docs/security.md': '# S\n\nWe used Firestore once.\n\n`ADMIN_USER_IDS` is the allowlist.\n' });
  const problems = stale(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /docs\/security\.md:3 "Firestore"/);
});

test('run exits non-zero without mode and with problems, zero when clean', () => {
  assert.equal(run([], () => {}), 2);
  assert.equal(run(['--certify', '--stale', '--root', tree()], () => {}), 0);
  assert.equal(run(['--certify', '--root', tree({ 'docs/privacy.md': '# P\n' })], () => {}), 1);
});
