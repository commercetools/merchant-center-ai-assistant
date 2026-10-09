/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { readConfiguration } from '../config';
import { getGoogleCredentials } from './credentials';

let bigQuery: BigQuery | undefined;
let storage: Storage | undefined;

/**
 * Lazy singleton from the shared credentials. `location` is only the default job
 * location: callers still pass `location` per query.
 */
export function getBigQueryClient(): BigQuery {
  if (!bigQuery) {
    const c = getGoogleCredentials();
    bigQuery = new BigQuery({
      projectId: c.projectId,
      credentials: c.credentials,
      location: readConfiguration().gcp.bigquery.location,
    });
  }
  return bigQuery;
}

export function getStorageClient(): Storage {
  if (!storage) {
    const c = getGoogleCredentials();
    storage = new Storage({ projectId: c.projectId, credentials: c.credentials });
  }
  return storage;
}

/**
 * The effective bucket: GCP_BUCKET_NAME, else `<project>-ai-assistant-images`.
 * Throws GcpNotConfiguredError without a service-account key.
 */
export function requireBucketName(): string {
  getGoogleCredentials();
  const name = readConfiguration().gcp.bucket.name;
  if (!name) throw new Error('bucket name could not be resolved');
  return name;
}

export function getDatasetId(): string {
  return readConfiguration().gcp.bigquery.datasetId;
}

export function resetGcpClientsForTests(): void {
  bigQuery = undefined;
  storage = undefined;
}
