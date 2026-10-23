/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration } from '../config';
import CustomError from '../errors/custom.error';

export class GcpNotConfiguredError extends CustomError {
  constructor(what = 'GCP_SA_KEY_BASE64') {
    super(503, `Google Cloud is not configured (${what})`);
  }
}

export interface GoogleCredentials {
  projectId: string;
  /** The Vertex AI location. */
  location: string;
  credentials: { client_email: string; private_key: string };
  googleAuthOptions: {
    projectId: string;
    credentials: { client_email: string; private_key: string };
    scopes: string[];
  };
}

/**
 * The single source of Google credentials: Vertex (text and image models),
 * `@google/genai`, BigQuery and Cloud Storage are all built from this value.
 * There is no API-key path and no Application Default Credentials fallback.
 * Never log the returned object.
 */
export function getGoogleCredentials(): GoogleCredentials {
  const { gcp } = readConfiguration();
  if (!gcp.serviceAccount) throw new GcpNotConfiguredError();
  const key = gcp.serviceAccount.reveal();
  const credentials = { client_email: key.client_email, private_key: key.private_key };
  const projectId = gcp.projectId ?? key.project_id;
  return {
    projectId,
    location: gcp.vertexLocation,
    credentials,
    googleAuthOptions: {
      projectId,
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
  };
}
