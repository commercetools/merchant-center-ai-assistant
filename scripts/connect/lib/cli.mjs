/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// The single place that builds `commercetools connect ...` argument arrays and runs them.
// Never goes through a shell: arguments are array elements handed to execFileSync.
import { execFileSync } from 'node:child_process';
import { maskArgs } from './config.mjs';

const BIN = 'commercetools';

function cmd(args) {
  return { bin: BIN, args: ['connect', ...args] };
}

/** One `--configuration` flag per value (the flag is variadic; one flag per item stays unambiguous). */
function configurationFlags(items = []) {
  return items.flatMap((item) => ['--configuration', item]);
}

export function stageDescribe({ connectorKey }) {
  return cmd(['connectorstaged', 'describe', '--key', connectorKey]);
}

export function stageCreate({ repoUrl, repoTag, creatorEmail, name, connectorKey, region, includeRegion = true }) {
  return cmd([
    'connectorstaged',
    'create',
    '--repository-url',
    repoUrl,
    '--repository-tag',
    repoTag,
    '--creator-email',
    creatorEmail,
    '--name',
    name,
    '--key',
    connectorKey,
    ...(includeRegion ? ['--supported-regions', region] : []),
  ]);
}

export function stageUpdate({ connectorKey, repoUrl, repoTag }) {
  return cmd([
    'connectorstaged',
    'update',
    '--key',
    connectorKey,
    ...(repoUrl ? ['--repository-url', repoUrl] : []),
    '--repository-tag',
    repoTag,
  ]);
}

export function publish({ connectorKey }) {
  return cmd(['connectorstaged', 'publish', '--key', connectorKey]);
}

export function preview({ connectorKey, deploymentKey, region, configuration }) {
  return cmd([
    'connectorstaged',
    'preview',
    '--key',
    connectorKey,
    '--deployment-key',
    deploymentKey,
    '--region',
    region,
    ...configurationFlags(configuration),
  ]);
}

export function deploymentCreate({ region, key, connectorKey, type, configuration }) {
  return cmd([
    'deployment',
    'create',
    '--region',
    region,
    '--key',
    key,
    '--connector-key',
    connectorKey,
    '--type',
    type,
    ...configurationFlags(configuration),
  ]);
}

export function redeploy({ key, configuration, updateConnector = false }) {
  return cmd([
    'deployment',
    'redeploy',
    '--key',
    key,
    ...configurationFlags(configuration),
    ...(updateConnector ? ['--updateConnector'] : []),
  ]);
}

export function describe({ key }) {
  return cmd(['deployment', 'describe', '--key', key]);
}

export function logs({ key, application, startDate, endDate }) {
  return cmd([
    'deployment',
    'logs',
    '--key',
    key,
    ...(application ? ['--application', application] : []),
    ...(startDate ? ['--startDate', startDate] : []),
    ...(endDate ? ['--endDate', endDate] : []),
  ]);
}

export function deleteDeployment({ key }) {
  return cmd(['deployment', 'delete', '--key', key]);
}

/** Display form of a command: secured values masked, arguments with spaces quoted. */
export function display(command) {
  const shown = maskArgs(command.args).map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a));
  return `$ ${command.bin} ${shown.join(' ')}`;
}

/**
 * Prints the command (masked) and, unless `dryRun`, executes it. `capture: true` returns
 * `{status, stdout, stderr}` instead of streaming to the terminal and never throws on a
 * non-zero exit. `bin` overrides the executable (tests point it at a fake CLI).
 */
export function run(command, { dryRun = false, exec = execFileSync, log = () => {}, capture = false, bin } = {}) {
  log(display(command));
  if (dryRun) return { status: 0, stdout: '', stderr: '', dryRun: true };
  const executable = bin ?? command.bin;
  if (!capture) {
    exec(executable, command.args, { stdio: 'inherit' });
    return { status: 0, stdout: '', stderr: '' };
  }
  try {
    const stdout = exec(executable, command.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout: String(stdout ?? ''), stderr: '' };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : 1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? error.message ?? ''),
    };
  }
}
