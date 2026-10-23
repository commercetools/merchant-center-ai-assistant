/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  ByProjectKeyRequestBuilder,
  createApiBuilderFromCtpClient,
} from '@commercetools/platform-sdk';
import { buildClient } from '../../client/build.client';
import { Secret } from '../../config';
import { CustomObjectGateway } from '../../persistence/gateway/custom-object.gateway';
import { UnavailableError } from '../../persistence/gateway/errors';
import type { RetryOptions } from '../../persistence/gateway/retry';
import type { LifecycleEnv } from '../env';

export const PROBE_CONTAINER = 'ai-assistant-lifecycle';
export const PROBE_KEY = 'post-deploy-probe';

export type ProbeResult = { ok: true } | { ok: false; reason: string };

export function statusOf(error: unknown): number | undefined {
  const e = error as { statusCode?: unknown; code?: unknown } | null;
  if (typeof e?.statusCode === 'number') return e.statusCode;
  if (typeof e?.code === 'number') return e.code;
  return undefined;
}

/**
 * API root for the lifecycle scripts, built from the lifecycle environment with the service's
 * own client builder (change C) instead of readConfiguration(): the scripts must not demand
 * keys they do not use (design D-U9).
 */
export function createLifecycleApiRoot(
  env: LifecycleEnv
): ByProjectKeyRequestBuilder {
  const client = buildClient({
    projectKey: env.projectKey,
    region: '',
    mcCloudIdentifier: 'gcp-us',
    clientId: env.api.clientId,
    clientSecret: new Secret(env.api.clientSecret),
    scope: env.api.scope,
    apiUrl: env.api.apiUrl,
    authUrl: env.api.authUrl,
  });
  return createApiBuilderFromCtpClient(client).withProjectKey({
    projectKey: env.projectKey,
  });
}

const failed = (error: unknown, what: string): ProbeResult => ({
  ok: false,
  reason:
    error instanceof UnavailableError
      ? `${what} failed (commercetools unavailable)`
      : `${what} failed (HTTP ${statusOf(error) ?? 'unknown'})`,
});

/**
 * Create-or-update, read, delete a throw-away Custom Object through change E's gateway
 * (which owns timeout and transport retries): proves the generated API client can write.
 * Idempotent: the object is removed again (a missing object on delete is fine).
 */
export async function runProbe(
  apiRoot: ByProjectKeyRequestBuilder,
  retry?: RetryOptions
): Promise<ProbeResult> {
  const gateway = new CustomObjectGateway(apiRoot, retry);
  try {
    await gateway.put(PROBE_CONTAINER, PROBE_KEY, {
      checkedAt: new Date().toISOString(),
    });
    await gateway.get(PROBE_CONTAINER, PROBE_KEY);
  } catch (error) {
    if (statusOf(error) === 403) {
      return {
        ok: false,
        reason:
          'missing manage_key_value_documents scope on the generated API client',
      };
    }
    return failed(error, 'custom object probe');
  }
  try {
    await gateway.delete(PROBE_CONTAINER, PROBE_KEY);
  } catch (error) {
    return failed(error, 'custom object probe removal');
  }
  return { ok: true };
}
