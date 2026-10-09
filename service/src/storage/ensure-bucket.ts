/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../utils/logger.utils';
import { errorCode, storage, storageTarget } from './ports';

/** Thrown when the bucket is missing and the service account may not create it. */
export class BucketUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BucketUnavailableError';
  }
}

/** Fixed text (design DL-11): names the permission, the roles and the manual command. */
export const bucketMissingMessage = (): string => {
  const t = storageTarget();
  return (
    `bucket ${t.bucketName} is missing and the service account cannot create it (storage.buckets.create): ` +
    'grant roles/storage.admin on the project, or pre-create the bucket and grant roles/storage.objectAdmin on it only. ' +
    `Pre-create with: gcloud storage buckets create gs://${t.bucketName} --location=${t.location} --uniform-bucket-level-access --public-access-prevention`
  );
};

let pending: Promise<void> | undefined;

/**
 * Creates the bucket once per process (memoised promise, also for a failure, so there is no
 * retry storm and exactly one error log). 409 means it already exists: success, and an
 * existing bucket's configuration is never modified. In `public` mode a bucket created here
 * gets the bucket-level binding `allUsers` -> `roles/storage.objectViewer`.
 */
export function ensureBucket(): Promise<void> {
  pending ??= (async () => {
    const t = storageTarget();
    try {
      await storage().createBucket(t.bucketName, {
        location: t.location,
        iamConfiguration: {
          uniformBucketLevelAccess: { enabled: true },
          publicAccessPrevention: t.mode === 'private' ? 'enforced' : 'inherited',
        },
      });
      logger.info(`Created image bucket ${t.bucketName} in ${t.location}`);
    } catch (error) {
      const code = errorCode(error);
      if (code === 409) return;
      if (code === 403) {
        const message = bucketMissingMessage();
        logger.error(message);
        throw new BucketUnavailableError(message);
      }
      pending = undefined;
      throw error;
    }
    if (t.mode === 'public') {
      const target = storage().bucket(t.bucketName);
      const [policy] = await target.iam.getPolicy();
      const bindings = [...(policy.bindings ?? [])];
      bindings.push({ role: 'roles/storage.objectViewer', members: ['allUsers'] });
      await target.iam.setPolicy({ ...policy, bindings });
    }
  })();
  return pending;
}

export const resetEnsureBucketForTests = (): void => {
  pending = undefined;
};
