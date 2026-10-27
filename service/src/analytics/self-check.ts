/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import { BucketUnavailableError, bucketMissingMessage } from '../storage/ensure-bucket';
import { putImage } from '../storage/gcs-objects';
import { bucket, errorCode, storageTarget } from '../storage/ports';
import { logger } from '../utils/logger.utils';
import {
  DatasetUnavailableError,
  datasetMissingMessage,
  ensureDataset,
} from './bigquery/ensure-dataset';
import { bigQueryTarget, gcpConfigured } from './bigquery/ports';
import { createNewTable, deleteTable, insertRows } from './bigquery/tables';

export interface GcpAnalyticsReport {
  bigquery: string;
  storage: string;
  visibility: string;
}

export interface SelfCheckDeps {
  /** Anonymous HEAD of the probe object. */
  head(url: string): Promise<number>;
}

const defaultDeps: SelfCheckDeps = {
  head: async (url) => (await fetch(url, { method: 'HEAD' })).status,
};

/** 1x1 transparent PNG: the probe object (a valid image, 67 bytes). */
const PROBE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/*
 * Closed list of reasons (never raw Google error text: it may contain project ids).
 */
const REASONS = {
  noKey: 'service-account key is not configured (GCP_SA_KEY_BASE64)',
  bigqueryDenied:
    'bigquery access denied: grant roles/bigquery.jobUser and roles/bigquery.dataEditor on the project to the service account',
  bigqueryFailed: 'bigquery probe failed: check that the BigQuery API is enabled and billing is active',
  storageDenied:
    'storage access denied: grant roles/storage.objectAdmin on the bucket (or roles/storage.admin on the project)',
  storageFailed: 'storage probe failed: check that the Cloud Storage API is enabled',
  visibilityUnchecked: 'visibility could not be checked (anonymous request failed)',
} as const;

const probeTableSchema = [{ name: 'probe', type: 'STRING' as const, mode: 'NULLABLE' as const }];

async function checkBigQuery(): Promise<string> {
  const tableId = `_selfcheck_${randomBytes(6).toString('hex')}`;
  try {
    await ensureDataset();
    const { tableRef } = await createNewTable(tableId, probeTableSchema, {
      app: 'ai-assistant',
      purpose: 'selfcheck',
    });
    try {
      await insertRows(tableRef, [{ probe: 'ok' }]);
    } finally {
      await deleteTable(tableRef).catch(() => undefined);
    }
    return 'ok';
  } catch (error) {
    if (error instanceof DatasetUnavailableError) return datasetMissingMessage();
    return errorCode(error) === 403 ? REASONS.bigqueryDenied : REASONS.bigqueryFailed;
  }
}

async function checkStorage(
  deps: SelfCheckDeps
): Promise<{ storage: string; visibility: string }> {
  let objectName: string | undefined;
  try {
    // Triggers the idempotent bucket bootstrap on NoSuchBucket.
    ({ objectName } = await putImage(PROBE_PNG, 'image/png', '_selfcheck'));
  } catch (error) {
    if (error instanceof BucketUnavailableError) {
      return { storage: bucketMissingMessage(), visibility: REASONS.visibilityUnchecked };
    }
    return {
      storage: errorCode(error) === 403 ? REASONS.storageDenied : REASONS.storageFailed,
      visibility: REASONS.visibilityUnchecked,
    };
  }

  try {
    const t = storageTarget();
    const url = `https://storage.googleapis.com/${t.bucketName}/${objectName}`;
    let visibility = 'ok';
    try {
      const status = await deps.head(url);
      if (t.mode === 'private' && status === 200) {
        visibility = `bucket is publicly readable although IMAGE_URL_MODE=private: remove the allUsers binding (gcloud storage buckets remove-iam-policy-binding gs://${t.bucketName} --member=allUsers --role=roles/storage.objectViewer)`;
      } else if (t.mode === 'public' && status !== 200) {
        visibility = `bucket is not publicly readable: gcloud storage buckets add-iam-policy-binding gs://${t.bucketName} --member=allUsers --role=roles/storage.objectViewer (and disable public access prevention)`;
      }
    } catch {
      visibility = REASONS.visibilityUnchecked;
    }
    return { storage: 'ok', visibility };
  } finally {
    await bucket()
      .file(objectName)
      .delete({ ignoreNotFound: true })
      .catch(() => undefined);
  }
}

/**
 * The analytics self-check run by `postDeploy`. Creates the dataset and the bucket
 * idempotently when missing and permitted, proves a probe table and a probe object can be
 * written and removed, and checks the anonymous visibility of the probe object against
 * `IMAGE_URL_MODE`. Never throws.
 */
export async function checkGcpAnalytics(
  deps: SelfCheckDeps = defaultDeps
): Promise<GcpAnalyticsReport> {
  try {
    if (!gcpConfigured()) {
      return { bigquery: REASONS.noKey, storage: REASONS.noKey, visibility: REASONS.noKey };
    }
    // Resolve the typed targets first so a bad configuration is one closed-list failure.
    bigQueryTarget();
    storageTarget();
    const [bigquery, storage] = await Promise.all([checkBigQuery(), checkStorage(deps)]);
    return { bigquery, storage: storage.storage, visibility: storage.visibility };
  } catch (error) {
    logger.warn('GCP analytics self-check could not run', {
      reason: error instanceof Error ? error.name : 'Error',
    });
    return {
      bigquery: REASONS.bigqueryFailed,
      storage: REASONS.storageFailed,
      visibility: REASONS.visibilityUnchecked,
    };
  }
}
