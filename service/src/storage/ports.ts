/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Readable } from 'node:stream';
import { readConfiguration } from '../config';
import { getStorageClient, requireBucketName } from '../gcp/clients';
import { getGoogleCredentials } from '../gcp/credentials';

/*
 * The slice of `@google-cloud/storage` this layer uses. The real client comes from
 * `getStorageClient` and is cast at one place (`storage()`); tests use `setStorageForTests`.
 * Forbidden everywhere in this layer: object ACLs, `makePublic`, signed URLs, `bucket.exists()`.
 */

export interface IamPolicyPort {
  bindings?: { role: string; members: string[] }[];
  [key: string]: unknown;
}

export interface FilePort {
  save(data: Buffer, options: Record<string, unknown>): Promise<unknown>;
  download(): Promise<[Buffer]>;
  getMetadata(): Promise<[{ size?: string | number }]>;
  createReadStream(): Readable;
  delete(options?: Record<string, unknown>): Promise<unknown>;
}

export interface BucketPort {
  file(name: string): FilePort;
  deleteFiles(options: Record<string, unknown>): Promise<unknown>;
  iam: {
    getPolicy(): Promise<[IamPolicyPort]>;
    setPolicy(policy: IamPolicyPort): Promise<unknown>;
  };
}

export interface StoragePort {
  bucket(name: string): BucketPort;
  createBucket(name: string, options: Record<string, unknown>): Promise<unknown>;
}

let override: StoragePort | undefined;

export const setStorageForTests = (fake: StoragePort | undefined): void => {
  override = fake;
};

export const storage = (): StoragePort =>
  override ?? (getStorageClient() as unknown as StoragePort);

export interface StorageTarget {
  bucketName: string;
  location: string;
  mode: 'private' | 'public';
}

/** Bucket, location and mode from typed configuration. Throws without a service-account key. */
export const storageTarget = (): StorageTarget => {
  getGoogleCredentials();
  const gcp = readConfiguration().gcp;
  return {
    bucketName: requireBucketName(),
    location: gcp.bucket.location,
    mode: gcp.imageUrlMode,
  };
};

export const bucket = (): BucketPort => storage().bucket(storageTarget().bucketName);

export { gcpConfigured } from '../analytics/bigquery/ports';

export const errorCode = (error: unknown): number | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
};
