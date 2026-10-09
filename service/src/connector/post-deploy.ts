/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { GcpAnalyticsReport } from '../analytics/self-check';
import type { ReadinessReport } from '../gcp/readiness';
import { checkAudience } from './checks/audience';
import {
  ProbeResult,
  createLifecycleApiRoot,
  runProbe as runCustomObjectProbe,
} from './checks/custom-object-probe';
import { reportProviders } from './checks/providers';
import { checkSaKey } from './checks/sa-key';
import { VertexResult, accessTokenSource, checkVertex } from './checks/vertex';
import { LifecycleEnv, LifecycleEnvError, readLifecycleEnv } from './env';

export interface PostDeployDeps {
  /** Throws LifecycleEnvError naming every missing variable. */
  readEnv: () => LifecycleEnv;
  /** One line per call; the default writes to stdout. */
  log: (line: string) => void;
  checkVertex: (input: {
    key: { client_email: string; private_key: string };
    projectId: string;
    env: LifecycleEnv;
  }) => Promise<VertexResult>;
  runProbe: (env: LifecycleEnv) => Promise<ProbeResult>;
  /** Change F's deep readiness (token, Vertex, BigQuery dry run, bucket). Undefined = not available. */
  gcpReadiness: () => Promise<ReadinessReport | undefined>;
  /**
   * Change L's `checkGcpAnalytics()`: creates the BigQuery dataset and the image bucket when
   * they are missing and the service account may, proves probe writes, checks image
   * visibility. Undefined = not available (configuration not readable here).
   */
  gcpAnalytics: () => Promise<GcpAnalyticsReport | undefined>;
}

/**
 * The checks run in a fixed order; a failed check never stops the later independent ones, so one
 * log shows everything that is wrong. `post-deploy: FAILED <check>` lines are what the
 * `finalize` command greps for, because a failing postDeploy does not reliably fail the
 * deployment (design D-U7 / E7). Returns the exit code; never throws, never exits the process.
 */
export async function run(deps: PostDeployDeps): Promise<number> {
  const { log } = deps;
  const failures: string[] = [];
  const fail = (check: string, reason: string): void => {
    failures.push(check);
    log(`post-deploy: FAILED ${check}: ${reason}`);
  };
  const guarded = async <T>(check: string, work: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await work();
    } catch (error) {
      // Only the error class: a message could quote a secret.
      fail(check, `unexpected error (${error instanceof Error ? error.name : 'Error'})`);
      return undefined;
    }
  };

  let env: LifecycleEnv;
  try {
    env = deps.readEnv();
  } catch (error) {
    if (error instanceof LifecycleEnvError) {
      fail('env', error.message);
    } else {
      fail('env', 'the lifecycle environment could not be read');
    }
    return 1;
  }

  // 1. service-account key
  const sa = checkSaKey(env.saKeyBase64, env.gcpProjectId);
  if (!sa.ok) {
    fail('sa-key', sa.reason);
  } else {
    sa.warnings.forEach((w) => log(`post-deploy: warning: ${w}`));
    log(`post-deploy: sa-key ok (project ${sa.projectId})`);
  }

  // 2. Vertex AI reachability (needs the key)
  if (sa.ok) {
    const vertex = await guarded('vertex', () =>
      deps.checkVertex({ key: sa.key, projectId: sa.projectId, env })
    );
    if (vertex) {
      if (!vertex.ok) fail('vertex', `HTTP ${vertex.status}: ${vertex.hint}`);
      else if (vertex.warning) log(`post-deploy: warning: vertex: ${vertex.warning}`);
      else log(`post-deploy: vertex ok (${env.liteModel} in ${env.vertexLocation})`);
    }
  }

  // 3. Custom Object access
  const probe = await guarded('probe', () => deps.runProbe(env));
  if (probe) {
    if (!probe.ok) fail('probe', probe.reason);
    else log('post-deploy: custom objects ok');
  }

  // 4. Google readiness (token, Vertex) and the analytics self-check (warnings only)
  if (sa.ok) {
    try {
      const report = await deps.gcpReadiness();
      if (!report) {
        log('post-deploy: warning: gcp readiness skipped (the full service configuration is not readable here)');
      } else {
        // bigquery and storage are covered, with creation, by the analytics self-check below.
        for (const check of report.checks) {
          if (check.name === 'bigquery' || check.name === 'storage') continue;
          if (!check.ok) {
            log(`post-deploy: warning: gcp readiness ${check.name}: ${check.detail}`);
          }
        }
      }
    } catch {
      log('post-deploy: warning: gcp readiness could not run');
    }

    try {
      const analytics = await deps.gcpAnalytics();
      if (!analytics) {
        log('post-deploy: warning: gcp analytics skipped (the full service configuration is not readable here)');
      } else {
        // Reasons come from a closed list (names the IAM role or the manual command).
        for (const field of ['bigquery', 'storage', 'visibility'] as const) {
          if (analytics[field] !== 'ok') {
            log(`post-deploy: gcp analytics: ${field}: ${analytics[field]}`);
          }
        }
      }
    } catch {
      log('post-deploy: warning: gcp analytics could not run');
    }
  }

  // 5. provider report (informational)
  reportProviders(env.providerEnv).lines.forEach((line) => log(line));

  // 6. audience consistency and the service origin
  const audience = checkAudience({ mcAudience: env.mcAudience, serviceUrl: env.serviceUrl });
  audience.lines.forEach((line) => log(line));
  if (!audience.ok) fail('audience', audience.failure ?? 'MC_AUDIENCE is inconsistent');

  if (failures.length > 0) {
    log(`post-deploy: FAILED ${failures.join(', ')}`);
    return 1;
  }
  log('post-deploy: OK');
  return 0;
}

async function defaultGcpReadiness(): Promise<ReadinessReport | undefined> {
  try {
    // readConfiguration() throws when the lifecycle environment lacks keys the app needs
    // (unverified platform behaviour U5): skip instead of reporting a misleading failure.
    const { readConfiguration } = await import('../config');
    readConfiguration();
    const { checkGcpReadiness } = await import('../gcp/readiness');
    return await checkGcpReadiness({ deep: true });
  } catch {
    return undefined;
  }
}

async function defaultGcpAnalytics(): Promise<GcpAnalyticsReport | undefined> {
  try {
    const { readConfiguration } = await import('../config');
    readConfiguration();
    const { checkGcpAnalytics } = await import('../analytics/self-check');
    return await checkGcpAnalytics();
  } catch {
    return undefined;
  }
}

export function defaultDeps(): PostDeployDeps {
  return {
    readEnv: () => readLifecycleEnv(),
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
    checkVertex: ({ key, projectId, env }) =>
      checkVertex({
        projectId,
        location: env.vertexLocation,
        model: env.liteModel,
        getAccessToken: accessTokenSource(key),
      }),
    runProbe: (env) => runCustomObjectProbe(createLifecycleApiRoot(env)),
    gcpReadiness: defaultGcpReadiness,
    gcpAnalytics: defaultGcpAnalytics,
  };
}

async function main(): Promise<void> {
  process.exitCode = await run(defaultDeps());
}

if (typeof require !== 'undefined' && require.main === module) {
  void main();
}
