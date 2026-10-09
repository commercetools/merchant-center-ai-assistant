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
import { normalisePath, routeCalls, routesFromCode, routesFromDoc, run } from './check-api-doc.mjs';

const FILES = {
  'service/src/app.ts': "app.use('/service', serviceRouter);\n",
  'service/src/routes/service.route.ts': [
    "import { statusRouter } from './status.route';",
    "import { sessionRouter } from './session.route';",
    "import { createFilesRouter } from '../storage/files-route';",
    "serviceRouter.use('/', statusRouter);",
    "serviceRouter.use('/session', verifyMcSession, sessionRouter);",
    "serviceRouter.use('/files', verifyMcSession, createFilesRouter());",
    '',
  ].join('\n'),
  'service/src/routes/status.route.ts': "statusRouter.get('/status', status);\n",
  'service/src/routes/session.route.ts': "sessionRouter.post('/', a);\nsessionRouter.get('/:sessionId/messages', b);\nsessionRouter.delete(\n  '/:sessionId',\n  c\n);\n",
  'service/src/storage/files-route.ts': "router.get('/:sessionId/:fileName', handler);\nconst x = map.get('not-a-route');\n",
};

const DOC = `# API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | \`/service/status\` | health |
| POST | \`/service/session\` | create |
| GET | \`/service/session/:id/messages\` | list |
| DELETE | \`/service/session/:sessionId\` | delete |
| GET | \`/service/files/:sessionId/:fileName\` | image |
`;

function tree(files = FILES, doc = DOC) {
  const root = mkdtempSync(join(tmpdir(), 'api-'));
  for (const [path, text] of Object.entries({ ...files, 'docs/api.md': doc })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('path parameters and trailing slashes are normalised', () => {
  assert.equal(normalisePath('/service/session/:sessionId/'), '/service/session/:param');
  assert.equal(normalisePath('/service//status'), '/service/status');
});

test('routeCalls reads multi-line calls and ignores maps', () => {
  const calls = routeCalls(FILES['service/src/routes/session.route.ts'] + FILES['service/src/storage/files-route.ts']);
  assert.equal(calls.length, 4);
});

test('routes come from the mounts, factories included', () => {
  const root = tree();
  assert.deepEqual([...routesFromCode(root)].sort(), [
    'DELETE /service/session/:param',
    'GET /service/files/:param/:param',
    'GET /service/session/:param/messages',
    'GET /service/status',
    'POST /service/session',
  ]);
  assert.equal(routesFromDoc(DOC).size, 5);
});

test('a documented tree passes', () => {
  assert.equal(run(['--root', tree()], () => {}), 0);
});

test('a removed table row prints the route and exits 1', () => {
  const root = tree(FILES, DOC.replace(/.*session\/:id\/messages.*\n/, ''));
  const lines = [];
  assert.equal(run(['--root', root], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.startsWith('UNDOCUMENTED GET /service/session/:param/messages')));
});

test('a documented route that does not exist exits 1', () => {
  const root = tree(FILES, `${DOC}| PUT | \`/service/ghost\` | none |\n`);
  const lines = [];
  assert.equal(run(['--root', root], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.startsWith('NOT-IN-CODE PUT /service/ghost')));
});

test('a route added in code is reported', () => {
  const files = { ...FILES, 'service/src/routes/status.route.ts': FILES['service/src/routes/status.route.ts'] + "statusRouter.get('/health', status);\n" };
  const lines = [];
  assert.equal(run(['--root', tree(files)], (l) => lines.push(l)), 1);
  assert.ok(lines.some((l) => l.startsWith('UNDOCUMENTED GET /service/health')));
});
