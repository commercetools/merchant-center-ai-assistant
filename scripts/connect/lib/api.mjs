/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Read-only Connect REST helper: the CLI has no machine-readable output.
import { authHost, connectApiHost } from './url.mjs';

export class DeploymentFailed extends Error {
  constructor(message = 'deployment status is Failed (see the logs and the runbook)') {
    super(message);
    this.name = 'DeploymentFailed';
  }
}

export class Timeout extends Error {
  constructor(message) {
    super(message);
    this.name = 'Timeout';
  }
}

async function errorMessage(response) {
  let detail = '';
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') detail = `: ${body.message}`;
  } catch {
    // no JSON body
  }
  return `HTTP ${response.status}${detail}`;
}

/**
 * Client-credentials token for the read-only scope. Errors carry the status and the Connect
 * message only, never the secret or the token.
 */
export async function getToken({ fetch, region, projectKey, clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: `view_connectors_deployments:${projectKey}`,
  });
  const response = await fetch(`${authHost(region)}/oauth/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`token request failed: ${await errorMessage(response)}`);
  const json = await response.json();
  return { token: json.access_token, expiresInMs: Math.max(0, (json.expires_in ?? 0) - 30) * 1000 };
}

/** Wraps getToken with a cache for the token lifetime. */
export function tokenSource(params, now = () => Date.now()) {
  let cached;
  return async () => {
    if (cached && cached.until > now()) return cached.token;
    const { token, expiresInMs } = await getToken(params);
    cached = { token, until: now() + expiresInMs };
    return token;
  };
}

export async function getDeployment({ fetch, region, projectKey, key, getTokenValue }) {
  const token = await getTokenValue();
  const url = `${connectApiHost(region)}/${projectKey}/deployments/key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`get deployment failed: ${await errorMessage(response)}`);
  return response.json();
}

/**
 * Polls until the deployment status is `Deployed`. `Failed` throws DeploymentFailed.
 * With `since` (a snapshot of the deployment before a redeploy) it first waits for evidence
 * that the redeploy started (version or lastModifiedAt changed, or the status left `Deployed`),
 * because right after `redeploy` the old `Deployed` status can still be read.
 * If nothing changes within `graceMs` the wait proceeds and `onWarning` is told.
 * `ready` is an extra condition for a Deployed deployment (for example: the service URL is known).
 */
export async function waitForDeployed({
  getDeployment: get,
  sleep,
  now = () => Date.now(),
  timeoutMs = 25 * 60 * 1000,
  intervalMs = 20_000,
  since,
  graceMs = 90_000,
  onWarning = () => {},
  ready = () => true,
}) {
  const started = now();
  let started2 = since === undefined;
  let warned = false;
  for (;;) {
    const deployment = await get();
    if (deployment?.status === 'Failed') throw new DeploymentFailed();
    if (!started2) {
      const changed =
        (since.version !== undefined && deployment?.version !== since.version) ||
        (since.lastModifiedAt !== undefined && deployment?.lastModifiedAt !== since.lastModifiedAt) ||
        deployment?.status !== 'Deployed';
      if (changed) started2 = true;
      else if (now() - started >= graceMs) {
        started2 = true;
        if (!warned) {
          warned = true;
          onWarning('no sign that the redeploy started within the grace period; continuing');
        }
      }
    }
    if (started2 && deployment?.status === 'Deployed' && ready(deployment)) return deployment;
    if (now() - started >= timeoutMs) {
      throw new Timeout(
        `deployment did not reach Deployed within ${Math.round(timeoutMs / 60000)} minutes (last status: ${deployment?.status ?? 'unknown'})`
      );
    }
    await sleep(intervalMs);
  }
}
