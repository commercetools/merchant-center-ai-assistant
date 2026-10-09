/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkEnvExample,
  docsExitCode,
  findDocsHygiene,
  findFraming,
  matchesForbidden,
} from '../check-repo-rules.mjs';

// test words are built by concatenation so this file does not trip the prose check
const FRAMING = ['de' + 'mo', 'p' + 'oc', 'pre-' + 'sales'];

test('env: secret-shaped key must be empty', () => {
  assert.equal(checkEnvExample('GCP_SA_KEY_BASE64=abc\n').length, 1);
  assert.equal(checkEnvExample('GCP_SA_KEY_BASE64=\n').length, 0);
  assert.equal(checkEnvExample('CTP_CLIENT_SECRET=replace-me\n').length, 1);
});

test('env: accepts localhost url and integers', () => {
  const text = '# comment\nMCP_TOOLS_TTL_MS=1800000\nSERVICE_URL=http://localhost:8080/x\nENTRY_POINT_URI_PATH=ai-assistant\nFLAG=true\n';
  assert.deepEqual(checkEnvExample(text), []);
});

test('env: rejects deployed url', () => {
  const bad = checkEnvExample('CHAT_SERVICE_ENDPOINT_URL=https://service-1234.europe-west1.example-host.net/x\n');
  assert.equal(bad.length, 1);
  assert.equal(bad[0].key, 'CHAT_SERVICE_ENDPOINT_URL');
});

test('ci: workflows path rejected', () => {
  assert.equal(matchesForbidden('.github/workflows/ci.yml'), 'NO-CI');
  assert.equal(matchesForbidden('service/.env.local'), 'FORBIDDEN-FILE');
  assert.equal(matchesForbidden('service/LICENSE'), 'THIRD-PARTY');
  assert.equal(matchesForbidden('LICENSE'), null);
  assert.equal(matchesForbidden('service/src/index.ts'), null);
});

test('ci: Dockerfile and netlify.toml rejected', () => {
  assert.equal(matchesForbidden('service/Dockerfile'), 'NO-CI');
  assert.equal(matchesForbidden('mc-app/netlify.toml'), 'NO-CI');
  assert.equal(matchesForbidden('infra/main.tf'), 'NO-CI');
});

test('framing: word boundary (a longer word containing a framing word is fine)', () => {
  assert.equal(findFraming('the ' + 'de' + 'monstrate method\n').length, 0);
  assert.equal(findFraming('a ' + 'p' + 'ocket\n').length, 0);
});

test('framing: the three framing words are rejected', () => {
  for (const w of FRAMING) assert.equal(findFraming(`this is a ${w} sentence\n`).length, 1, w);
});

test('docs: absolute path and deployed host reported', () => {
  const host = 'https://x.ngr' + 'ok.io/a';
  const text = ['see /Users/' + 'someone/code', host, 'fine line', 'see scripts/labs-gate.sh'].join('\n');
  const classes = findDocsHygiene('plans/x.md', text, ['scripts/labs-gate.sh']).map((f) => `${f.line}:${f.class}`);
  assert.deepEqual(classes, ['1:absolute-path', '2:deployed-host', '4:internal-ref']);
});

test('docs: strict exits non-zero only with findings', () => {
  assert.equal(docsExitCode(3, true), 1);
  assert.equal(docsExitCode(0, true), 0);
  assert.equal(docsExitCode(3, false), 0);
});
