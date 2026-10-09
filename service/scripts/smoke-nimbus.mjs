/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Smoke check of the embedded Nimbus MCP.
//
//   SERVICE_URL=https://<deployed service>  npm run smoke:nimbus   -> GET <url>/service/status/nimbus
//   npm run build && npm run smoke:nimbus                          -> local: starts the built manager
//
// Asserts that the 7 expected tools are served. Exit code 0 = OK. No secrets, no auth header.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const EXPECTED = [
  'get_component',
  'get_docs_page',
  'get_tokens',
  'list_components',
  'migrate_from_uikit',
  'search_docs',
  'search_icons',
];

const out = (line) => process.stdout.write(`${line}\n`);
const fail = (reason) => {
  process.stderr.write(`FAIL - ${reason}\n`);
  process.exit(1);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const verify = (body) => {
  if (body.status === 'disabled') {
    fail('Nimbus is disabled (NIMBUS_MCP_ENABLED=false); nothing to check');
  }
  if (body.status !== 'ok') {
    fail(`status is "${body.status}"${body.missing ? `, missing: ${body.missing.join(', ')}` : ''}${body.reason ? `, reason: ${body.reason}` : ''}`);
  }
  const names = [...(body.toolNames ?? [])].sort();
  const missing = EXPECTED.filter((name) => !names.includes(name));
  if (missing.length > 0 || body.tools !== EXPECTED.length) {
    fail(`expected ${EXPECTED.length} tools, got ${body.tools}; missing: ${missing.join(', ') || 'none'}`);
  }
  out(`OK - nimbus-mcp ${body.nimbusMcp} (${body.tools} tools)`);
};

const checkRemote = async (serviceUrl) => {
  const url = `${serviceUrl.replace(/\/+$/, '')}/service/status/nimbus`;
  // A sandbox scales to zero (about 15 s to boot): retry once before giving up.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const body = await res.json();
      if (res.status === 200 || attempt === 2) {
        if (res.status !== 200) fail(`GET ${url} answered ${res.status}: ${JSON.stringify(body)}`);
        return verify(body);
      }
    } catch (error) {
      if (attempt === 2) fail(`GET ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(20_000);
  }
};

const checkLocal = async () => {
  process.chdir(root);
  const { NimbusProcessManager } = require('../build/nimbus/process-manager.js');
  const { resolveNimbusMcp, isResolveError } = require('../build/nimbus/resolve.js');
  const resolved = resolveNimbusMcp(root);
  if (isResolveError(resolved)) fail(resolved.error);
  const log = {
    debug: () => undefined,
    info: () => undefined,
    warn: (message) => process.stderr.write(`warn: ${message}\n`),
    error: (message) => process.stderr.write(`error: ${message}\n`),
  };
  const manager = new NimbusProcessManager({ ...resolved, log });
  try {
    verify(await manager.readiness());
  } finally {
    await manager.close();
  }
};

const serviceUrl = process.env.SERVICE_URL;
await (serviceUrl ? checkRemote(serviceUrl) : checkLocal());
