#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Runs the built service twice and puts a small proxy in front, to prove that a flow started on one
// instance can finish on another (E2E-V-05). The proxy is the authority on which instance served
// which request (the service status body has no instance id).
// Usage: node scripts/e2e/two-instance.mjs --a 8081 --b 8082 --listen 8080 --pin '/authorize=a,/callback=b'
//        --pin ''  (empty) means round robin. Needs `cd service && npm run build` and service/.env.local.
// Run it from the repo root; it writes the routing log to stdout and to plans/evidence/$E2E_RUN/proxy.log.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Parses `/authorize=a,/callback=b` into [{match, target}]; empty string gives no pins. */
export function parsePins(spec) {
  return (spec ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const [match, target] = p.split('=');
      if (!match || !['a', 'b'].includes(target)) throw new Error(`bad pin "${p}", expected <substring>=a|b`);
      return { match, target };
    });
}

/** Chooses `a` or `b` for a request path: the first pin whose substring matches, else round robin. */
export function createRouter(pins, startAt = 0) {
  let n = startAt;
  return (path) => {
    const pin = pins.find((p) => path.includes(p.match));
    if (pin) return pin.target;
    const t = n % 2 === 0 ? 'a' : 'b';
    n += 1;
    return t;
  };
}

function main(argv) {
  const get = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
  const ports = { a: Number(get('--a', 8081)), b: Number(get('--b', 8082)) };
  const listen = Number(get('--listen', 8080));
  const route = createRouter(parsePins(get('--pin', '')));
  const run = process.env.E2E_RUN;
  const logFile = run ? join(REPO, 'plans', 'evidence', run, 'proxy.log') : null;
  if (logFile) mkdirSync(dirname(logFile), { recursive: true });
  const children = ['a', 'b'].map((id) =>
    spawn('node', ['--env-file=.env.local', 'build/index.js'], {
      cwd: join(REPO, 'service'),
      env: { ...process.env, PORT: String(ports[id]), INSTANCE_ID: id },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  );
  const server = http.createServer((req, res) => {
    const target = route(req.url ?? '/');
    const line = `${new Date().toISOString()} ${req.method} ${(req.url ?? '').split('?')[0]} -> ${target}`;
    console.log(line);
    if (logFile) appendFileSync(logFile, `${line}\n`);
    const upstream = http.request(
      { host: '127.0.0.1', port: ports[target], method: req.method, path: req.url, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res); // no buffering: server-sent events keep working
      }
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.listen(listen, () => console.log(`proxy on ${listen}: a=${ports.a} b=${ports.b}`));
  const stop = () => {
    server.close();
    children.forEach((c) => c.kill('SIGTERM'));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`two-instance: ${e.message}`);
    process.exit(2);
  }
}
