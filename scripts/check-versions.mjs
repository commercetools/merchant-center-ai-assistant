/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Fails when the three frontends drift apart on shared tooling:
//   - every @commercetools-frontend/* package uses one version,
//   - jest, @tabler/icons and @tabler/icons-react use one declared range,
//   - @babel/core stays on one major version,
//   - @commercetools/nimbus is an exact pin equal to the service's
//     @commercetools/nimbus-mcp pin (page generation and the Nimbus knowledge
//     tools must describe the same Nimbus release).
// Set CHECK_ROOT to run against another directory (used by the tests).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.CHECK_ROOT
  ? path.resolve(process.env.CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPS = ['mc-app', 'composed-apps', 'mc-view-app'];
const FRONTEND_PREFIX = '@commercetools-frontend/';
const SAME_RANGE = ['jest', '@tabler/icons', '@tabler/icons-react'];
const SAME_MAJOR = ['@babel/core'];
const NIMBUS = '@commercetools/nimbus';
const NIMBUS_MCP = '@commercetools/nimbus-mcp';
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function readPackage(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function declared(pkg, name) {
  for (const section of ['dependencies', 'devDependencies']) {
    if (pkg[section]?.[name] !== undefined) return pkg[section][name];
  }
  return undefined;
}

const manifests = APPS.map((app) => ({ file: `${app}/package.json`, pkg: readPackage(`${app}/package.json`) }));
const problems = [];

// 1. @commercetools-frontend/* uses one version.
const frontend = [];
for (const { file, pkg } of manifests) {
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, version] of Object.entries(pkg[section] ?? {})) {
      if (name.startsWith(FRONTEND_PREFIX)) frontend.push({ file, name, version });
    }
  }
}
const frontendVersions = new Set(frontend.map((entry) => entry.version));
if (frontendVersions.size > 1) {
  for (const entry of frontend) problems.push(`${entry.file} ${entry.name} ${entry.version}`);
  problems.push(`DRIFT: ${frontendVersions.size} distinct @commercetools-frontend versions`);
}

// 2. Shared tooling: same range, or same major.
function compare(name, normalise, label) {
  const seen = manifests
    .map(({ file, pkg }) => ({ file, version: declared(pkg, name) }))
    .filter((entry) => entry.version !== undefined);
  const distinct = new Set(seen.map((entry) => normalise(entry.version)));
  if (distinct.size > 1) {
    for (const entry of seen) problems.push(`${entry.file} ${name} ${entry.version}`);
    problems.push(`DRIFT: ${name} differs across the frontends (${label})`);
  }
}
for (const name of SAME_RANGE) compare(name, (version) => version, 'must be identical');
for (const name of SAME_MAJOR) {
  compare(name, (version) => version.replace(/^[^\d]*/, '').split('.')[0], 'must share a major');
}

// 3. Nimbus is an exact pin that matches the service's nimbus-mcp pin.
const servicePath = 'service/package.json';
let mcpPin;
if (fs.existsSync(path.join(ROOT, servicePath))) {
  mcpPin = declared(readPackage(servicePath), NIMBUS_MCP);
}
for (const { file, pkg } of manifests) {
  const version = declared(pkg, NIMBUS);
  if (version === undefined) continue;
  if (!EXACT.test(version)) {
    problems.push(`${file} ${NIMBUS} ${version} is not an exact pin`);
  } else if (mcpPin !== undefined && version !== mcpPin) {
    problems.push(`${file} ${NIMBUS} ${version} differs from ${servicePath} ${NIMBUS_MCP} ${mcpPin}`);
  }
}
if (mcpPin === undefined) problems.push(`${servicePath} does not pin ${NIMBUS_MCP}`);
else if (!EXACT.test(mcpPin)) problems.push(`${servicePath} ${NIMBUS_MCP} ${mcpPin} is not an exact pin`);

if (problems.length > 0) {
  for (const line of problems) process.stdout.write(`${line}\n`);
  process.exit(1);
}
process.stdout.write(`OK ${[...frontendVersions][0] ?? 'no frontend packages'}; nimbus ${mcpPin}\n`);
