/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { GoogleAuth } from 'google-auth-library';
import { readConfiguration } from '../config';
import { countTokens } from '../llm/count-tokens';
import { getBigQueryClient, getStorageClient, requireBucketName } from './clients';
import { getGoogleCredentials } from './credentials';

export interface ReadinessCheck {
  name: 'decode' | 'token' | 'vertex' | 'bigquery' | 'storage';
  ok: boolean;
  /** A fixed string: never a token, key material or a provider message. */
  detail: string;
}

export interface ReadinessReport {
  ok: boolean;
  checks: ReadinessCheck[];
}

const CHECK_TIMEOUT_MS = 8_000;

class CheckTimeout extends Error {}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckTimeout()), CHECK_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function run(
  name: ReadinessCheck['name'],
  failure: string,
  work: () => Promise<string | undefined>
): Promise<ReadinessCheck> {
  try {
    const detail = await withTimeout(work());
    return detail === undefined
      ? { name, ok: false, detail: failure }
      : { name, ok: true, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof CheckTimeout ? 'timed out' : failure,
    };
  }
}

function isForbidden(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 403
  );
}

const mintAccessToken = async (): Promise<string | undefined> => {
  const token = await new GoogleAuth(getGoogleCredentials().googleAuthOptions).getAccessToken();
  return token ? 'ok' : undefined;
};

const pingVertex = async (): Promise<string | undefined> => {
  // countTokens returns 0 on any error: treat 0 as a failure here.
  return (await countTokens('ping', 'main')) > 0 ? 'ok' : undefined;
};

const dryRunBigQuery = async (): Promise<string> => {
  await getBigQueryClient().createQueryJob({
    query: 'SELECT 1',
    dryRun: true,
    location: readConfiguration().gcp.bigquery.location,
  });
  return 'ok';
};

const inspectBucket = async (): Promise<string> => {
  try {
    const [exists] = await getStorageClient().bucket(requireBucketName()).exists();
    return exists ? 'ok' : 'missing';
  } catch (error) {
    // A bucket-scoped objectAdmin role has no storage.buckets.get.
    if (isForbidden(error)) return 'not inspectable with the current roles';
    throw error;
  }
};

/**
 * Sequential readiness checks for the postDeploy script.
 * Never throws. A missing dataset or bucket is not a failure here: `checkGcpAnalytics()`
 * reports and creates them.
 */
export async function checkGcpReadiness(
  options: { deep?: boolean } = {}
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];

  const decode = await run('decode', 'service-account key is not configured', async () => {
    return readConfiguration().gcp.serviceAccount ? 'ok' : undefined;
  });
  checks.push(decode);
  if (!decode.ok) return { ok: false, checks };

  checks.push(await run('token', 'access token could not be minted', mintAccessToken));
  checks.push(await run('vertex', 'countTokens failed', pingVertex));

  if (options.deep) {
    checks.push(await run('bigquery', 'dry-run query failed', dryRunBigQuery));
    checks.push(await run('storage', 'bucket check failed', inspectBucket));
  }

  return { ok: checks.every((c) => c.ok), checks };
}
