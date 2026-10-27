/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getBigQueryClient, getDatasetId } from '../../gcp/clients';
import { getGoogleCredentials } from '../../gcp/credentials';
import { readConfiguration } from '../../config';

/*
 * The slice of `@google-cloud/bigquery` this layer uses, as structural types. The real client
 * is cast at one place (`bq()`), tests pass a fake through `setBigQueryForTests`. Clients are
 * never built here: they come from `getBigQueryClient`.
 */

export interface TableMetadataPort {
  schema?: { fields?: { name?: string; type?: string }[] };
  numRows?: string;
  numBytes?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  expirationTime?: string;
  labels?: Record<string, string>;
}

export interface WritableLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  end(chunk: string): unknown;
}

export interface TablePort {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[TableMetadataPort]>;
  insert(rows: Record<string, unknown>[], options: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
  createWriteStream(options: Record<string, unknown>): WritableLike;
}

export interface DatasetPort {
  table(id: string): TablePort;
  createTable(id: string, options: Record<string, unknown>): Promise<[TablePort]>;
}

export interface TableReferencePort {
  projectId: string;
  datasetId: string;
  tableId: string;
}

export interface JobPort {
  id?: string;
  metadata?: {
    statistics?: {
      query?: {
        statementType?: string;
        referencedTables?: TableReferencePort[];
        totalBytesProcessed?: string;
      };
    };
  };
  getQueryResults(options: Record<string, unknown>): Promise<
    [Record<string, unknown>[], unknown?, { totalRows?: string }?]
  >;
}

export interface BigQueryPort {
  dataset(id: string): DatasetPort;
  createDataset(id: string, options: Record<string, unknown>): Promise<unknown>;
  createQueryJob(options: Record<string, unknown>): Promise<[JobPort, ...unknown[]]>;
}

let override: BigQueryPort | undefined;

/** Tests inject a fake client. */
export const setBigQueryForTests = (fake: BigQueryPort | undefined): void => {
  override = fake;
};

/** The BigQuery client (`getBigQueryClient`). Throws `GcpNotConfiguredError` without a key. */
export const bq = (): BigQueryPort =>
  override ?? (getBigQueryClient() as unknown as BigQueryPort);

export interface BigQueryTarget {
  projectId: string;
  datasetId: string;
  location: string;
}

/** Project, dataset and location from typed configuration (never from `process.env`). */
export const bigQueryTarget = (): BigQueryTarget => {
  const { projectId } = getGoogleCredentials();
  return {
    projectId,
    datasetId: getDatasetId(),
    location: readConfiguration().gcp.bigquery.location,
  };
};

/** Whether the Google service-account key is configured (the only switch of this layer). */
export const gcpConfigured = (): boolean =>
  readConfiguration().gcp.serviceAccount !== undefined;

/** HTTP-ish status of a Google client error, when it carries one. */
export const errorCode = (error: unknown): number | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
};

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
