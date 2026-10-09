/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Starts the BUILT service (node build/index.js), which Jest alone cannot prove
// (CommonJS output vs ESM-only dependencies). Run `npm run build` first.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18080;
const baseEnv = {
  PATH: process.env.PATH,
  NODE_ENV: 'development',
  PORT: String(PORT),
  CTP_PROJECT_KEY: 'p',
  CTP_REGION: 'us-central1.gcp',
  PERSISTENCE_DRIVER: 'memory',
  // fixed throw-away key, valid shape (base64 of 32 bytes)
  ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
};

function start(env) {
  const child = spawn(process.execPath, ['build/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  return { child, output: () => output };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function expectUp() {
  const { child, output } = start(baseEnv);
  try {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/service/status`);
        const body = await res.json();
        if (res.status === 200 && body.status === 'UP') return;
      } catch {
        // not listening yet
      }
      await sleep(200);
    }
    throw new Error(`service did not become UP within 10 s\n${output()}`);
  } finally {
    child.kill('SIGTERM');
  }
}

async function expectRefusal() {
  const env = { ...baseEnv };
  delete env.CTP_REGION;
  const { child, output } = start(env);
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('service did not exit within 5 s with an invalid configuration'));
    }, 5000);
    child.on('exit', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  if (code !== 1) throw new Error(`expected exit code 1, got ${code}`);
  if (!output().includes('CTP_REGION')) throw new Error(`message does not name CTP_REGION\n${output()}`);
}

try {
  await expectUp();
  await expectRefusal();
  process.stdout.write('smoke OK\n');
} catch (error) {
  process.stderr.write(`smoke FAILED: ${error.message}\n`);
  process.exit(1);
}
