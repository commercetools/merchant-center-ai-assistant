import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertOutSafe, pruneInternal, findForbiddenLeftovers, setRepositoryMetadata, checkAddListing, parseAddDryRun,
} from '../prepare-publish.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'prep-'));
  for (const rel of files) {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, 'x');
  }
  return root;
}

test('prune: removes listed paths and keeps plans and openspec', () => {
  const root = tree(['plans/a.md', 'openspec/b.md', 'scripts/internal/x.mjs', 'scripts/labs-gate.sh', '.claude/s.json', 'CLAUDE.md', 'plans/evidence/e.txt']);
  const removed = pruneInternal(root, ['.claude/', 'CLAUDE.md', 'scripts/labs-gate.sh', 'scripts/internal/', 'plans/evidence/', 'plans/missing/']);
  assert.deepEqual(removed.sort(), ['.claude/', 'CLAUDE.md', 'plans/evidence/', 'scripts/internal/', 'scripts/labs-gate.sh']);
  assert.ok(existsSync(join(root, 'plans/a.md')));
  assert.ok(existsSync(join(root, 'openspec/b.md')));
  assert.ok(!existsSync(join(root, 'scripts/internal')));
  assert.throws(() => pruneInternal(root, ['../escape']), /refusing/);
});

test('prune: refuses out inside the repo', () => {
  assert.throws(() => assertOutSafe('/dev/repo/pub', { devRoot: '/dev/repo', allowAny: true, home: '/home/nobody' }), /inside the development repository/);
  assert.throws(() => assertOutSafe('/home/nobody/elsewhere/pub', { devRoot: '/dev/repo', home: '/home/nobody' }), /labs-publish/);
  assert.throws(() => assertOutSafe('/', { devRoot: '/dev/repo', allowAny: true, home: '/home/nobody' }), /too broad/);
  assert.equal(assertOutSafe('/home/nobody/labs-publish/ai-assistant', { devRoot: '/dev/repo', home: '/home/nobody' }), '/home/nobody/labs-publish/ai-assistant');
});

test('prune: detects forbidden leftovers (.github, Dockerfile, .env)', () => {
  const root = tree(['.github/workflows/ci.yml', 'service/Dockerfile', 'service/Dockerfile.dev', 'mc-app/.env', 'mc-app/.env.local', 'mc-app/.env.example', 'README.md']);
  assert.deepEqual(findForbiddenLeftovers(root), ['.github', '.github/workflows', '.github/workflows/ci.yml', 'mc-app/.env', 'mc-app/.env.local', 'service/Dockerfile', 'service/Dockerfile.dev']);
  assert.deepEqual(findForbiddenLeftovers(tree(['README.md', 'service/.env.example'])), []);
});

test('metadata: sets repository fields and keeps indent', () => {
  const four = '{\n    "name": "@commercetools-labs/ai-assistant-mc-app",\n    "version": "0.1.0"\n}\n';
  const out = setRepositoryMetadata(four, 'mc-app');
  const json = JSON.parse(out);
  assert.deepEqual(json.repository, { type: 'git', url: 'git+https://github.com/commercetools/ai-assistant.git', directory: 'mc-app' });
  assert.equal(json.bugs.url, 'https://github.com/commercetools/ai-assistant/issues');
  assert.equal(json.homepage, 'https://github.com/commercetools/ai-assistant#readme');
  assert.match(out, /\n    "repository": \{/);
  assert.ok(out.endsWith('}\n'));
  assert.equal(JSON.parse(setRepositoryMetadata('{"name":"a"}', 'scripts')).repository.directory, undefined);
  assert.equal(setRepositoryMetadata(out, 'mc-app'), out, 'idempotent');
});

test('listing: forbidden patterns', () => {
  const bad = checkAddListing(['a/.env', 'b/.env.local', 'c/node_modules/x.js', 'mc-app/build/x.js', 'x/public/i.html', 'run.log', '.DS_Store', 'k.pem', 'k.key', 'ok/.env.example', 'ok/.env.connect.example', 'src/index.ts']);
  assert.deepEqual(bad, ['a/.env', 'b/.env.local', 'c/node_modules/x.js', 'mc-app/build/x.js', 'x/public/i.html', 'run.log', '.DS_Store', 'k.pem', 'k.key']);
  assert.deepEqual(parseAddDryRun("add 'a/b.ts'\nadd 'c.md'\n"), ['a/b.ts', 'c.md']);
});
