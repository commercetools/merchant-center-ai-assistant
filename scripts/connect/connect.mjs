#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Deployment CLI: wraps the official `commercetools connect ...` CLI (mutations) and the Connect
// REST API (read-only: service URL and status). Dependency free; arguments are arrays, never a shell.
// Usage: node scripts/connect/connect.mjs <command> [options]   (see `help`)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  DeploymentFailed,
  Timeout,
  getDeployment,
  tokenSource,
  waitForDeployed,
} from './lib/api.mjs';
import * as cli from './lib/cli.mjs';
import {
  MissingEnvError,
  NotConfigurableError,
  configureArgs,
  loadEnv,
  phase1Args,
  phase2Args,
  redact,
} from './lib/config.mjs';
import { logDate, mergeEnv, parseEnvFile, parseSince } from './lib/envfile.mjs';
import { isGcpRegion } from './lib/regions.mjs';
import { smoke } from './lib/smoke.mjs';
import { mcApplicationUrls, originOf, serviceUrlFrom } from './lib/url.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = ['stage', 'publish', 'preview', 'deploy', 'finalize', 'configure', 'update-code', 'status', 'logs', 'delete'];
const TYPES = ['sandbox', 'preview', 'production'];
const VALUE_FLAGS = ['--type', '--tag', '--application', '--since'];
const BOOL_FLAGS = ['--dry-run', '--confirm-production', '--yes', '--preview'];

const USAGE = `Usage: node scripts/connect/connect.mjs <command> [options]

Commands:
  stage                 create or update the staged connector from REPO_URL and REPO_TAG
  publish               publish the staged connector (needed before sandbox/production)
  preview               create a short-lived preview deployment from the staged connector
  deploy                phase 1: create the deployment (all four applications, no service URL yet)
  finalize              phase 2: read the service URL, redeploy with the endpoint URL for the Merchant Center apps, smoke check
  configure KEY=VALUE   configuration-only redeploy for allow-listed keys (provider keys, Google settings, ADMIN_USER_IDS)
  update-code --tag vX  stage the new tag, publish, redeploy with --updateConnector
  status                print deployment status, version and application URLs
  logs                  print deployment logs [--application name] [--since 1h]
  delete --yes          delete the deployment (data in commercetools stays)

Options:
  --dry-run             print the commands that would run (secured values masked) and run nothing
  --type sandbox|production   deployment type for deploy (default sandbox); production needs --confirm-production
  --confirm-production  explicit acknowledgement for --type production
  --tag vX.Y.Z          repository tag (stage, update-code)
  --preview             address the preview deployment (<DEPLOYMENT_KEY>-preview) in status, logs, delete

Settings come from environment variables, optionally from scripts/connect/.env.connect
(see scripts/connect/.env.connect.example). Runbook: docs/deployment-runbook.md
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (BOOL_FLAGS.includes(arg)) flags[arg.slice(2)] = true;
    else if (VALUE_FLAGS.includes(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      flags[arg.slice(2)] = value;
      i += 1;
    } else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`);
    else positional.push(arg);
  }
  return { command, flags, positional };
}

function defaultDeps(env) {
  return {
    exec: execFileSync,
    fetch: globalThis.fetch,
    sleep: (ms) => delay(ms),
    now: () => Date.now(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    // test seam: a fake CLI executable
    bin: env.CONNECT_CLI_BIN || undefined,
    envFile: join(HERE, '.env.connect'),
    timing: { intervalMs: 20_000, smokeAttempts: 10, smokeDelayMs: 10_000, timeoutMs: 25 * 60 * 1000, graceMs: 90_000 },
  };
}

function deploymentKeyOf(env, flags) {
  return flags.preview ? `${env.DEPLOYMENT_KEY}-preview` : env.DEPLOYMENT_KEY;
}

/** Runs one command. Returns the process exit code; never calls process.exit. */
export async function main(argv, processEnv = process.env, overrides = {}) {
  const base = defaultDeps(processEnv);
  const deps = { ...base, ...overrides, timing: { ...base.timing, ...(overrides.timing ?? {}) } };

  let env = processEnv;
  if (deps.envFile && existsSync(deps.envFile)) {
    env = mergeEnv(processEnv, parseEnvFile(readFileSync(deps.envFile, 'utf8')));
  }
  // Every printed line passes through redact(): a known secret value never reaches the terminal.
  const out = (line) => deps.out(redact(line, env));
  const err = (line) => deps.err(redact(line, env));

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    err(error.message);
    err(USAGE);
    return 2;
  }
  const { command, flags, positional } = parsed;
  if (command === undefined || command === 'help' || command === '--help') {
    out(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (!COMMANDS.includes(command)) {
    err(`unknown command '${command}'`);
    err(USAGE);
    return 2;
  }

  const dryRun = flags['dry-run'] === true;
  const runCli = (cmd, opts = {}) => cli.run(cmd, { dryRun, exec: deps.exec, log: out, bin: deps.bin, ...opts });

  try {
    switch (command) {
      case 'stage':
        return await cmdStage();
      case 'publish':
        return cmdPublish();
      case 'preview':
        return cmdPreview();
      case 'deploy':
        return cmdDeploy();
      case 'finalize':
        return await cmdFinalize();
      case 'configure':
        return await cmdConfigure();
      case 'update-code':
        return await cmdUpdateCode();
      case 'status':
        return await cmdStatus();
      case 'logs':
        return cmdLogs();
      case 'delete':
        return cmdDelete();
      default:
        return 2;
    }
  } catch (error) {
    return report(error);
  }

  // ---- helpers ----------------------------------------------------------------------------

  function report(error) {
    if (error instanceof MissingEnvError || error instanceof NotConfigurableError || error instanceof UsageError) {
      err(error.message);
      return 2;
    }
    if (error instanceof DeploymentFailed || error instanceof Timeout) {
      err(`${error.message}. Hint: node scripts/connect/connect.mjs logs --application service`);
      return 1;
    }
    // Errors from the CLI carry the whole command line (with secured values): print status only.
    if (typeof error?.status === 'number') {
      err(`the Connect CLI exited with status ${error.status}`);
      return 1;
    }
    err(String(error?.message ?? error));
    return 1;
  }

  function api(e) {
    const params = {
      fetch: deps.fetch,
      region: e.CONNECT_REGION,
      projectKey: e.CTP_PROJECT_KEY,
      clientId: e.CONNECT_CLIENT_ID,
      clientSecret: e.CONNECT_CLIENT_SECRET,
    };
    const getTokenValue = tokenSource(params, deps.now);
    return {
      get: (key) => getDeployment({ fetch: deps.fetch, region: e.CONNECT_REGION, projectKey: e.CTP_PROJECT_KEY, key, getTokenValue }),
    };
  }

  function waiter(getFn, extra = {}) {
    return waitForDeployed({
      getDeployment: getFn,
      sleep: deps.sleep,
      now: deps.now,
      timeoutMs: deps.timing.timeoutMs,
      intervalMs: deps.timing.intervalMs,
      graceMs: deps.timing.graceMs,
      onWarning: (m) => err(`warning: ${m}`),
      ...extra,
    });
  }

  function snapshot(d) {
    return { version: d?.version, lastModifiedAt: d?.lastModifiedAt };
  }

  async function smokeCheck(origin) {
    out(`smoke: GET ${origin}/service/status`);
    const result = await smoke({
      fetch: deps.fetch,
      sleep: deps.sleep,
      origin,
      attempts: deps.timing.smokeAttempts,
      delayMs: deps.timing.smokeDelayMs,
      onAttempt: (n, reason) => out(`smoke: attempt ${n} not ready (${reason})`),
    });
    out(`smoke: ok (attempt ${result.attempts})`);
  }

  // ---- commands ---------------------------------------------------------------------------

  async function cmdStage() {
    const e = loadEnv({ ...env, ...(flags.tag ? { REPO_TAG: flags.tag } : {}) }, ['stage']);
    const includeRegion = isGcpRegion(e.CONNECT_REGION);
    if (!includeRegion) err('warning: --supported-regions is documented for GCP regions only; the flag is omitted');
    const create = cli.stageCreate({
      repoUrl: e.REPO_URL,
      repoTag: e.REPO_TAG,
      creatorEmail: e.CREATOR_EMAIL,
      name: e.CONNECTOR_NAME,
      connectorKey: e.CONNECTOR_KEY,
      region: e.CONNECT_REGION,
      includeRegion,
    });
    if (dryRun) {
      err('dry run: assuming the staged connector does not exist yet (a real run uses connectorstaged update when it does)');
      runCli(create);
      return 0;
    }
    const probe = runCli(cli.stageDescribe({ connectorKey: e.CONNECTOR_KEY }), { capture: true });
    if (probe.status === 0) {
      runCli(cli.stageUpdate({ connectorKey: e.CONNECTOR_KEY, repoUrl: e.REPO_URL, repoTag: e.REPO_TAG }));
      return 0;
    }
    if (/not.?found|404|does not exist/i.test(`${probe.stdout}\n${probe.stderr}`)) {
      runCli(create);
      return 0;
    }
    err(`could not describe the staged connector (exit ${probe.status}); is the Connect CLI logged in? ${probe.stderr.trim().split('\n')[0] ?? ''}`);
    return 1;
  }

  function cmdPublish() {
    const e = loadEnv(env, ['publish']);
    runCli(cli.publish({ connectorKey: e.CONNECTOR_KEY }));
    return 0;
  }

  function cmdPreview() {
    const e = loadEnv(env, ['deploy']);
    runCli(
      cli.preview({
        connectorKey: e.CONNECTOR_KEY,
        deploymentKey: `${e.DEPLOYMENT_KEY}-preview`,
        region: e.CONNECT_REGION,
        configuration: phase1Args(e),
      })
    );
    out('note: preview deployments are short-lived; delete it when testing ends: delete --preview --yes');
    return 0;
  }

  function cmdDeploy() {
    const type = flags.type ?? env.DEPLOYMENT_TYPE ?? 'sandbox';
    if (!TYPES.includes(type)) throw new UsageError(`--type must be one of ${TYPES.join(', ')}`);
    if (type === 'preview') {
      err('use the preview command for preview deployments (connectorstaged preview)');
      return 2;
    }
    if (type === 'production' && flags['confirm-production'] !== true) {
      err('--type production needs --confirm-production (see "Deployment types" in docs/deployment-runbook.md)');
      return 2;
    }
    const e = loadEnv(env, ['deploy']);
    if (!dryRun) {
      const existing = runCli(cli.describe({ key: e.DEPLOYMENT_KEY }), { capture: true });
      if (existing.status === 0) {
        err(`deployment ${e.DEPLOYMENT_KEY} already exists: use finalize or configure instead of deploy`);
        return 1;
      }
    }
    runCli(
      cli.deploymentCreate({
        region: e.CONNECT_REGION,
        key: e.DEPLOYMENT_KEY,
        connectorKey: e.CONNECTOR_KEY,
        type,
        configuration: phase1Args(e),
      })
    );
    out('next: node scripts/connect/connect.mjs finalize');
    return 0;
  }

  async function cmdFinalize() {
    const e = loadEnv(env, ['deployment', 'api']);
    if (dryRun) {
      runCli(cli.redeploy({ key: e.DEPLOYMENT_KEY, configuration: phase2Args({ origin: 'https://<service-origin>' }) }));
      out('dry run: a real run waits for Deployed and reads the service URL first');
      return 0;
    }
    const { get } = api(e);
    const getFn = () => get(e.DEPLOYMENT_KEY);

    out('finalize: waiting for the first deployment (status Deployed and a service URL)');
    const first = await waiter(getFn, { ready: (d) => serviceUrlFrom(d) !== undefined });
    const origin = originOf(serviceUrlFrom(first));
    out(`finalize: service origin ${origin}`);

    const startedAt = deps.now();
    runCli(cli.redeploy({ key: e.DEPLOYMENT_KEY, configuration: phase2Args({ origin }) }));
    out('finalize: waiting for the configuration redeploy');
    const second = await waiter(getFn, { since: snapshot(first) });

    const log = runCli(
      cli.logs({ key: e.DEPLOYMENT_KEY, application: 'service', startDate: logDate(startedAt - 60_000) }),
      { capture: true }
    );
    const failed = `${log.stdout}`.split('\n').filter((l) => l.includes('post-deploy: FAILED'));
    if (failed.length > 0) {
      failed.forEach((l) => err(l.trim()));
      err('finalize: postDeploy reported a failure (the deployment may still show Deployed). See the runbook troubleshooting.');
      return 1;
    }
    for (const l of `${log.stdout}`.split('\n')) {
      if (l.includes('post-deploy:') && !l.includes('FAILED')) out(l.trim());
    }

    await smokeCheck(origin);

    out('[MANUAL M9] paste these URLs into the Merchant Center registrations');
    for (const { applicationName, url } of mcApplicationUrls(second)) {
      out(`  ${applicationName.padEnd(14)} ${url || '(no URL reported yet)'}`);
    }
    return 0;
  }

  async function cmdConfigure() {
    const items = configureArgs(positional);
    const e = loadEnv(env, ['deployment']);
    if (dryRun) {
      runCli(cli.redeploy({ key: e.DEPLOYMENT_KEY, configuration: items }));
      return 0;
    }
    const a = loadEnv(env, ['deployment', 'api']);
    const { get } = api(a);
    const getFn = () => get(a.DEPLOYMENT_KEY);
    const before = await getFn();
    const startedAt = deps.now();
    runCli(cli.redeploy({ key: a.DEPLOYMENT_KEY, configuration: items }));
    out('configure: waiting for the configuration redeploy');
    const after = await waiter(getFn, { since: snapshot(before) });
    const origin = serviceUrlFrom(after) ? originOf(serviceUrlFrom(after)) : undefined;
    if (origin) await smokeCheck(origin);
    const log = runCli(
      cli.logs({ key: a.DEPLOYMENT_KEY, application: 'service', startDate: logDate(startedAt - 60_000) }),
      { capture: true }
    );
    for (const l of log.stdout.split('\n')) {
      if (/post-deploy: (providers|FAILED)/.test(l)) out(l.trim());
    }
    return 0;
  }

  async function cmdUpdateCode() {
    if (!flags.tag) throw new UsageError('update-code needs --tag vX.Y.Z');
    const e = loadEnv({ ...env, REPO_TAG: flags.tag }, ['publish', 'deployment']);
    const stage = cli.stageUpdate({ connectorKey: e.CONNECTOR_KEY, repoUrl: e.REPO_URL, repoTag: flags.tag });
    const pub = cli.publish({ connectorKey: e.CONNECTOR_KEY });
    const re = cli.redeploy({ key: e.DEPLOYMENT_KEY, updateConnector: true });
    if (dryRun) {
      runCli(stage);
      runCli(pub);
      runCli(re);
      return 0;
    }
    const a = loadEnv({ ...env }, ['api']);
    const { get } = api(a);
    const getFn = () => get(a.DEPLOYMENT_KEY);
    const before = await getFn();
    runCli(stage);
    runCli(pub);
    runCli(re);
    out('update-code: waiting for the redeploy');
    const after = await waiter(getFn, { since: snapshot(before) });
    out(`update-code: deployment version ${before?.version ?? '?'} -> ${after?.version ?? '?'}`);
    if (before?.version !== undefined && before.version === after?.version) {
      err('warning: the deployment version did not change; check the connector publishing report (the new tag may have failed to build, the old code keeps serving)');
    }
    const url = serviceUrlFrom(after);
    if (url) await smokeCheck(originOf(url));
    return 0;
  }

  async function cmdStatus() {
    const e = loadEnv(env, ['deployment', 'api']);
    if (dryRun) {
      out(`dry run: would GET the deployment ${deploymentKeyOf(e, flags)} from the Connect API`);
      return 0;
    }
    const d = await api(e).get(deploymentKeyOf(e, flags));
    out(`deployment ${deploymentKeyOf(e, flags)}: status ${d?.status ?? 'unknown'}, version ${d?.version ?? '?'}`);
    if (d?.connector?.version !== undefined) out(`connector version ${d.connector.version}`);
    for (const app of d?.applications ?? []) {
      out(`  ${String(app.applicationName).padEnd(14)} ${app.url ?? '(no URL)'}`);
    }
    return 0;
  }

  function cmdLogs() {
    const e = loadEnv(env, ['deployment']);
    const since = flags.since ? parseSince(flags.since) : undefined;
    if (flags.since && since === undefined) throw new UsageError('--since must look like 30m, 1h or 2d');
    runCli(
      cli.logs({
        key: deploymentKeyOf(e, flags),
        application: flags.application,
        startDate: since === undefined ? undefined : logDate(deps.now() - since),
      })
    );
    return 0;
  }

  function cmdDelete() {
    const e = loadEnv(env, ['deployment']);
    if (flags.yes !== true) {
      err('delete removes the deployment; pass --yes to confirm (data in commercetools stays)');
      return 2;
    }
    runCli(cli.deleteDeployment({ key: deploymentKeyOf(e, flags) }));
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
