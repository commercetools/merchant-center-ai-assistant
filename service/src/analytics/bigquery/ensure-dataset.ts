/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';
import { bigQueryTarget, bq, errorCode } from './ports';

/** Thrown when the dataset is missing and the service account may not create it. */
export class DatasetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetUnavailableError';
  }
}

let pending: Promise<void> | undefined;

/** Fixed message: never contains a raw Google error. */
export const datasetMissingMessage = (): string => {
  const t = bigQueryTarget();
  return (
    `dataset ${t.datasetId} is missing and the service account cannot create it: ` +
    'grant roles/bigquery.dataEditor on the project or create it with: ' +
    `bq --location=${t.location} mk -d ${t.projectId}:${t.datasetId}`
  );
};

/**
 * Creates the dataset once per process (memoised promise). 409 `already exists` is success;
 * 403 is remembered as a failure with the fixed actionable message and one error log.
 */
export function ensureDataset(): Promise<void> {
  pending ??= (async () => {
    const t = bigQueryTarget();
    try {
      await bq().createDataset(t.datasetId, { location: t.location });
      logger.info(`Created BigQuery dataset ${t.datasetId} in ${t.location}`);
    } catch (error) {
      const code = errorCode(error);
      if (code === 409) return;
      if (code === 403) {
        const message = datasetMissingMessage();
        logger.error(message);
        throw new DatasetUnavailableError(message);
      }
      // Anything else: do not memoise, a later call may succeed.
      pending = undefined;
      throw error;
    }
  })();
  return pending;
}

export const resetEnsureDatasetForTests = (): void => {
  pending = undefined;
};
