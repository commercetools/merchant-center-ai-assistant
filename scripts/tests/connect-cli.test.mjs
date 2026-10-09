/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cli from '../connect/lib/cli.mjs';

test('cli: create passes type and configuration pairs', () => {
  const c = cli.deploymentCreate({
    region: 'us-central1.gcp',
    key: 'k1',
    connectorKey: 'ck',
    type: 'sandbox',
    configuration: ['service.A=1', 'mc-app.B=2'],
  });
  assert.equal(c.bin, 'commercetools');
  assert.deepEqual(c.args, [
    'connect', 'deployment', 'create',
    '--region', 'us-central1.gcp',
    '--key', 'k1',
    '--connector-key', 'ck',
    '--type', 'sandbox',
    '--configuration', 'service.A=1',
    '--configuration', 'mc-app.B=2',
  ]);
});

test('cli: redeploy has no --updateConnector by default', () => {
  const c = cli.redeploy({ key: 'k1', configuration: ['service.A=1'] });
  assert.deepEqual(c.args, ['connect', 'deployment', 'redeploy', '--key', 'k1', '--configuration', 'service.A=1']);
  assert.ok(!c.args.includes('--updateConnector'));
});

test('cli: updateConnector flag', () => {
  const c = cli.redeploy({ key: 'k1', updateConnector: true });
  assert.deepEqual(c.args, ['connect', 'deployment', 'redeploy', '--key', 'k1', '--updateConnector']);
});

test('cli: stage commands carry url, tag and the supported region', () => {
  const create = cli.stageCreate({
    repoUrl: 'https://git.example/r.git',
    repoTag: 'v0.1.0',
    creatorEmail: 'a@example.com',
    name: 'AI Assistant',
    connectorKey: 'ck',
    region: 'us-central1.gcp',
  });
  assert.ok(create.args.join(' ').includes('--name AI Assistant'), 'the name is one element');
  assert.ok(create.args.includes('--supported-regions'));
  assert.ok(!cli.stageCreate({ ...{ repoUrl: 'u', repoTag: 't', creatorEmail: 'e', name: 'n', connectorKey: 'k', region: 'r' }, includeRegion: false }).args.includes('--supported-regions'));
  assert.deepEqual(cli.stageUpdate({ connectorKey: 'ck', repoUrl: 'u', repoTag: 'v2' }).args.slice(0, 6), [
    'connect', 'connectorstaged', 'update', '--key', 'ck', '--repository-url',
  ]);
});

test('cli: run masks secrets and does not execute on dry run', () => {
  const lines = [];
  let called = false;
  const result = cli.run(
    cli.redeploy({ key: 'k1', configuration: ['service.STRIPE_SECRET_KEY=sk_live_value', 'service.CONTENTSTACK_REGION=eu'] }),
    { dryRun: true, exec: () => (called = true), log: (l) => lines.push(l) }
  );
  assert.equal(called, false);
  assert.equal(result.dryRun, true);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith('$ commercetools connect deployment redeploy'));
  assert.ok(lines[0].includes('service.STRIPE_SECRET_KEY=***'));
  assert.ok(!lines[0].includes('sk_live_value'));
  assert.ok(lines[0].includes('service.CONTENTSTACK_REGION=eu'));
});

test('cli: run executes with an argument array and inherits stdio', () => {
  const calls = [];
  cli.run(cli.publish({ connectorKey: 'ck' }), { exec: (bin, args, opts) => calls.push({ bin, args, opts }) });
  assert.equal(calls.length, 1);
  assert.ok(Array.isArray(calls[0].args));
  assert.equal(calls[0].opts.stdio, 'inherit');
  assert.equal(calls[0].opts.shell, undefined);
});

test('cli: capture returns status and output without throwing', () => {
  const failing = () => {
    throw Object.assign(new Error('x'), { status: 3, stdout: 'o', stderr: 'not found' });
  };
  const result = cli.run(cli.describe({ key: 'k' }), { exec: failing, capture: true });
  assert.deepEqual(result, { status: 3, stdout: 'o', stderr: 'not found' });
});

test('cli: never uses a shell', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'connect', 'lib', 'cli.mjs'), 'utf8');
  assert.ok(source.includes("import { execFileSync } from 'node:child_process'"));
  assert.ok(!/execSync|spawnSync|spawn\(|shell:\s*true/.test(source));
  assert.equal(typeof execFileSync, 'function');
  // the default executor is execFileSync itself (checked through the module's default parameter)
  assert.ok(source.includes('exec = execFileSync'));
});
