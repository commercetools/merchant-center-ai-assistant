/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { sanitise } from '../analytics/cleanup/bigquery-hook';
import { IMAGE_OBJECT_PREFIX } from '../storage/constants';
import { errorCode } from '../storage/ports';
import { getBigQueryClient, getDatasetId, getStorageClient, requireBucketName } from './clients';

/** What the check needs from Google Cloud; faked in tests. */
export interface ResiduePorts {
  /** Ids of all tables of the configured dataset (a missing dataset is an empty list). */
  listTableIds(): Promise<string[]>;
  /** Names of the objects of the effective bucket under `prefix` (a missing bucket is empty). */
  listObjectNames(prefix: string): Promise<string[]>;
}

export interface SessionResidue {
  tables: number;
  images: number;
}

/**
 * What of a session is still in Google Cloud after its deletion: temporary BigQuery tables
 * (`<sanitised session id>_*`) and images (`images/<session id>/`). Both counts are 0 when the
 * cleanup hooks did their work (E2E-L-07).
 */
export async function countSessionResidue(
  sessionId: string,
  ports: ResiduePorts
): Promise<SessionResidue> {
  const tablePrefix = `${sanitise(sessionId)}_`;
  const [tableIds, objects] = await Promise.all([
    ports.listTableIds(),
    ports.listObjectNames(`${IMAGE_OBJECT_PREFIX}${sessionId}/`),
  ]);
  return {
    tables: tableIds.filter((id) => id.startsWith(tablePrefix)).length,
    images: objects.length,
  };
}

/** Ports over the real clients (service-account key from the environment). */
export const gcpResiduePorts = (): ResiduePorts => ({
  async listTableIds() {
    try {
      const [tables] = await getBigQueryClient().dataset(getDatasetId()).getTables();
      return tables.map((t) => t.id ?? '').filter(Boolean);
    } catch (error) {
      if (errorCode(error) === 404) return [];
      throw error;
    }
  },
  async listObjectNames(prefix) {
    try {
      const [files] = await getStorageClient().bucket(requireBucketName()).getFiles({ prefix });
      return files.map((f) => f.name);
    } catch (error) {
      if (errorCode(error) === 404) return [];
      throw error;
    }
  },
});
