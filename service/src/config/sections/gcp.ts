/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  ServiceAccountKey,
  ServiceAccountKeyError,
  parseServiceAccountKey,
} from '../../gcp/service-account';
import { Secret } from '../secret';
import { oneOf, str } from '../parse';
import { SectionParser } from '../types';

export interface GcpConfig {
  /** Decoded service-account key; undefined only in development/test. */
  serviceAccount?: Secret<ServiceAccountKey>;
  /** GCP_PROJECT_ID, else the key's project_id (undefined without a key). */
  projectId?: string;
  vertexLocation: string;
  bigquery: { datasetId: string; location: string };
  /** `name` is derived as `<project>-ai-assistant-images` when GCP_BUCKET_NAME is unset. */
  bucket: { name?: string; location: string };
  imageUrlMode: 'private' | 'public';
  /** Boot warnings (names only, never values). */
  warnings: string[];
}

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const VERTEX_LOCATION = /^[a-z]+-[a-z]+[0-9]+$/;
const DATASET_ID = /^[A-Za-z0-9_]{1,1024}$/;
const LOCATION = /^[A-Za-z0-9-]+$/;
const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

/** Variables of the removed providers: ignored, but a stale value deserves one warning. */
const STALE_VARIABLES = [
  'GEMINI_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GCP_SERVICE_ACCOUNT_CLIENT_EMAIL',
  'GCP_SERVICE_ACCOUNT_PRIVATE_KEY',
] as const;

function checked(
  env: NodeJS.ProcessEnv,
  key: string,
  pattern: RegExp,
  fallback: string | undefined,
  errors: string[]
): string | undefined {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  if (pattern.test(raw)) return raw;
  errors.push(`${key}: has an invalid format`);
  return fallback;
}

export const parseGcp: SectionParser<GcpConfig> = (env, ctx) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (str(env, 'GOOGLE_VERTEX_API_KEY') !== undefined) {
    errors.push('GOOGLE_VERTEX_API_KEY: must not be set (it switches Vertex to API-key mode)');
  }
  for (const name of STALE_VARIABLES) {
    if (str(env, name) !== undefined) {
      warnings.push(`${name} is set but ignored: Google access uses GCP_SA_KEY_BASE64 only`);
    }
  }
  if (str(env, 'GCP_LOCATION') !== undefined) {
    warnings.push('GCP_LOCATION is set but ignored: it was renamed GCP_VERTEX_LOCATION');
  }

  let serviceAccount: Secret<ServiceAccountKey> | undefined;
  const encoded = str(env, 'GCP_SA_KEY_BASE64');
  if (encoded === undefined) {
    if (ctx.nodeEnv === 'production') errors.push('GCP_SA_KEY_BASE64: is required');
  } else {
    try {
      serviceAccount = new Secret(parseServiceAccountKey(encoded));
    } catch (error) {
      errors.push(
        error instanceof ServiceAccountKeyError
          ? error.message
          : 'GCP_SA_KEY_BASE64: could not be processed'
      );
    }
  }

  const projectId =
    checked(env, 'GCP_PROJECT_ID', PROJECT_ID, undefined, errors) ??
    serviceAccount?.reveal().project_id;

  const vertexRaw = str(env, 'GCP_VERTEX_LOCATION');
  let vertexLocation = 'us-central1';
  if (vertexRaw !== undefined) {
    if (['global', 'us', 'eu'].includes(vertexRaw) || VERTEX_LOCATION.test(vertexRaw)) {
      vertexLocation = vertexRaw;
    } else {
      errors.push('GCP_VERTEX_LOCATION: must be global, us, eu or a region such as us-central1');
    }
  }

  const bucketName =
    checked(env, 'GCP_BUCKET_NAME', BUCKET_NAME, undefined, errors) ??
    (projectId ? `${projectId}-ai-assistant-images` : undefined);

  return {
    errors,
    value: {
      serviceAccount,
      projectId,
      vertexLocation,
      bigquery: {
        datasetId:
          checked(env, 'GCP_BIGQUERY_DATASET_ID', DATASET_ID, 'aiassistant', errors) ??
          'aiassistant',
        location:
          checked(env, 'GCP_BIGQUERY_LOCATION', LOCATION, 'us-central1', errors) ??
          'us-central1',
      },
      bucket: {
        name: bucketName,
        location:
          checked(env, 'GCP_BUCKET_LOCATION', LOCATION, 'us-central1', errors) ??
          'us-central1',
      },
      imageUrlMode: oneOf(env, 'IMAGE_URL_MODE', ['private', 'public'], 'private', errors),
      warnings,
    },
  };
};
