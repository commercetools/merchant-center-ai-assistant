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
 * TODO(E): switch the probe to change E's persistence gateway once it is merged.
 */
export function createLifecycleApiRoot(env: LifecycleEnv): ByProjectKeyRequestBuilder {
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
  return createApiBuilderFromCtpClient(client).withProjectKey({ projectKey: env.projectKey });
}

/**
 * Create-or-update, read, delete a throw-away Custom Object: proves the generated API client
 * can write. Idempotent: the object is removed again (a 404 on delete is fine).
 */
export async function runProbe(apiRoot: ByProjectKeyRequestBuilder): Promise<ProbeResult> {
  const address = { container: PROBE_CONTAINER, key: PROBE_KEY };
  try {
    await apiRoot
      .customObjects()
      .post({ body: { ...address, value: { checkedAt: new Date().toISOString() } } })
      .execute();
    await apiRoot.customObjects().withContainerAndKey(address).get().execute();
  } catch (error) {
    if (statusOf(error) === 403) {
      return {
        ok: false,
        reason: 'missing manage_key_value_documents scope on the generated API client',
      };
    }
    return { ok: false, reason: `custom object probe failed (HTTP ${statusOf(error) ?? 'unknown'})` };
  }
  try {
    await apiRoot.customObjects().withContainerAndKey(address).delete().execute();
  } catch (error) {
    if (statusOf(error) !== 404) {
      return { ok: false, reason: `custom object probe could not be removed (HTTP ${statusOf(error) ?? 'unknown'})` };
    }
  }
  return { ok: true };
}
