/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// OWNED BY SPEC F - replace body, keep the exported type.
import { Secret } from '../secret';
import { oneOf, str } from '../parse';
import { SectionParser } from '../types';

export interface GcpConfig {
  /** Base64 of the service-account JSON key; decoded and validated by change F. */
  serviceAccount?: Secret<string>;
  projectId?: string;
  vertexLocation: string;
  bigquery: { datasetId: string; location: string };
  bucket: { name?: string; location: string };
  imageUrlMode: 'private' | 'public';
}

export const parseGcp: SectionParser<GcpConfig> = (env) => {
  const errors: string[] = [];
  const sa = str(env, 'GCP_SA_KEY_BASE64');
  return {
    errors,
    value: {
      serviceAccount: sa ? new Secret(sa) : undefined,
      projectId: str(env, 'GCP_PROJECT_ID'),
      vertexLocation: str(env, 'GCP_VERTEX_LOCATION') ?? 'us-central1',
      bigquery: {
        datasetId: str(env, 'GCP_BIGQUERY_DATASET_ID') ?? 'aiassistant',
        location: str(env, 'GCP_BIGQUERY_LOCATION') ?? 'us-central1',
      },
      bucket: {
        name: str(env, 'GCP_BUCKET_NAME'),
        location: str(env, 'GCP_BUCKET_LOCATION') ?? 'us-central1',
      },
      imageUrlMode: oneOf(env, 'IMAGE_URL_MODE', ['private', 'public'], 'private', errors),
    },
  };
};
