/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { str } from '../config/parse';

/** The seven optional third-party provider keys (only the ones that are set). */
export const PROVIDER_ENV_KEYS = [
  'CONTENTSTACK_API_KEY',
  'CONTENTSTACK_MANAGEMENT_TOKEN',
  'CONTENTSTACK_BRANCH',
  'CONTENTSTACK_REGION',
  'ALGOLIA_MCP_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_CONNECTED_ACCOUNT_ID',
] as const;

export type ProviderEnv = Partial<Record<(typeof PROVIDER_ENV_KEYS)[number], string>>;

export interface LifecycleEnv {
  projectKey: string;
  /** Raw Base64 secret: only checks/sa-key.ts may look inside. */
  saKeyBase64: string;
  api: {
    apiUrl: string;
    authUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
  };
  gcpProjectId?: string;
  vertexLocation: string;
  bigqueryDatasetId: string;
  bigqueryLocation: string;
  bucketName?: string;
  bucketLocation: string;
  liteModel: string;
  /** CONNECT_SERVICE_URL: injected by Connect into the lifecycle scripts. */
  serviceUrl?: string;
  providerEnv: ProviderEnv;
}

export class LifecycleEnvError extends Error {
  constructor(readonly missing: string[]) {
    super(`missing environment variable(s): ${missing.join(', ')}`);
    this.name = 'LifecycleEnvError';
  }
}

const REQUIRED = [
  'CTP_PROJECT_KEY',
  'CTP_API_URL',
  'CTP_AUTH_URL',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_SCOPE',
  'GCP_SA_KEY_BASE64',
] as const;

/**
 * Lifecycle scripts run before and outside the app: they validate only what they use and
 * name every missing variable. `env` is a parameter so tests never touch the real one.
 * (design D-U9: with readConfiguration(), the only code that reads the process environment.)
 */
export function readLifecycleEnv(env: NodeJS.ProcessEnv = process.env): LifecycleEnv {
  const missing = REQUIRED.filter((key) => str(env, key) === undefined);
  if (missing.length > 0) throw new LifecycleEnvError([...missing]);
  const need = (key: (typeof REQUIRED)[number]): string => str(env, key) as string;

  const providerEnv: ProviderEnv = {};
  for (const key of PROVIDER_ENV_KEYS) {
    const value = str(env, key);
    if (value !== undefined) providerEnv[key] = value;
  }

  return {
    projectKey: need('CTP_PROJECT_KEY'),
    saKeyBase64: need('GCP_SA_KEY_BASE64'),
    api: {
      apiUrl: need('CTP_API_URL'),
      authUrl: need('CTP_AUTH_URL'),
      clientId: need('CTP_CLIENT_ID'),
      clientSecret: need('CTP_CLIENT_SECRET'),
      scope: need('CTP_SCOPE'),
    },
    gcpProjectId: str(env, 'GCP_PROJECT_ID'),
    vertexLocation: str(env, 'GCP_VERTEX_LOCATION') ?? 'us-central1',
    bigqueryDatasetId: str(env, 'GCP_BIGQUERY_DATASET_ID') ?? 'aiassistant',
    bigqueryLocation: str(env, 'GCP_BIGQUERY_LOCATION') ?? 'us-central1',
    bucketName: str(env, 'GCP_BUCKET_NAME'),
    bucketLocation: str(env, 'GCP_BUCKET_LOCATION') ?? 'us-central1',
    liteModel: str(env, 'GEMINI_LITE_MODEL_NAME') ?? 'gemini-3.5-flash-lite',
    serviceUrl: str(env, 'CONNECT_SERVICE_URL'),
    providerEnv,
  };
}
