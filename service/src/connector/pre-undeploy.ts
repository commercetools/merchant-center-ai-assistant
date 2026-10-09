/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk';
import {
  PROBE_CONTAINER,
  PROBE_KEY,
  createLifecycleApiRoot,
  statusOf,
} from './checks/custom-object-probe';
import { containers } from '../persistence/names';
import { LifecycleEnv, readLifecycleEnv } from './env';

/**
 * Containers that hold user data. They are only reported, never touched (design D-U10).
 * The names come from change E's container constants (per-session message and feedback
 * snapshot containers are created per id and are not listed here).
 */
const names = containers();
export const DATA_CONTAINERS: readonly string[] = [
  names.settings(),
  names.sessions(),
  names.tokens(),
  names.states(),
  names.feedback(),
  names.suggestions(),
];

export interface PreUndeployDeps {
  readEnv: () => LifecycleEnv;
  apiRoot: (env: LifecycleEnv) => ByProjectKeyRequestBuilder;
  log: (line: string) => void;
}

/**
 * Removes only the probe object and reports which data containers remain. Undeploy must never
 * be blocked: an unreachable API is a warning and the exit code stays 0. The only DELETE this
 * script can issue is for the probe object.
 */
export async function run(deps: PreUndeployDeps): Promise<number> {
  const { log } = deps;
  let env: LifecycleEnv;
  try {
    env = deps.readEnv();
  } catch {
    log(
      'pre-undeploy: warning: the lifecycle environment is incomplete; nothing was cleaned up'
    );
    return 0;
  }

  try {
    const apiRoot = deps.apiRoot(env);
    try {
      await apiRoot
        .customObjects()
        .withContainerAndKey({ container: PROBE_CONTAINER, key: PROBE_KEY })
        .delete()
        .execute();
      log('pre-undeploy: probe object removed');
    } catch (error) {
      if (statusOf(error) !== 404) throw error;
      log('pre-undeploy: no probe object to remove');
    }

    for (const container of DATA_CONTAINERS) {
      try {
        const page = await apiRoot
          .customObjects()
          .withContainer({ container })
          .get({ queryArgs: { limit: 1 } })
          .execute();
        if (page.body.results.length > 0) {
          log(`pre-undeploy: data retained in ${container}`);
        }
      } catch (error) {
        if (statusOf(error) !== 404) throw error;
      }
    }
  } catch (error) {
    log(
      `pre-undeploy: warning: cleanup incomplete (HTTP ${statusOf(error) ?? 'unknown'}); undeploy continues`
    );
  }
  log('pre-undeploy: done');
  return 0;
}

export function defaultDeps(): PreUndeployDeps {
  return {
    readEnv: () => readLifecycleEnv(),
    apiRoot: (env) => createLifecycleApiRoot(env),
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
  };
}

async function main(): Promise<void> {
  process.exitCode = await run(defaultDeps());
}

if (typeof require !== 'undefined' && require.main === module) {
  void main();
}
