/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Readable } from 'node:stream';
import type {
  BucketPort,
  FilePort,
  IamPolicyPort,
  StoragePort,
} from '../../src/storage/ports';
import { googleError } from './bigquery-fake';

export interface StoredObject {
  data: Buffer;
  options: Record<string, unknown>;
}

/** A scriptable in-memory stand-in for the Storage client. */
export class FakeStorage implements StoragePort {
  bucketExists = true;
  createBucketError?: Error;
  createBucketCalls: { name: string; options: Record<string, unknown> }[] = [];
  objects = new Map<string, StoredObject>();
  saveErrors: Error[] = [];
  downloads: string[] = [];
  readStreams: { name: string; stream: Readable }[] = [];
  createReadStreamOverride?: () => Readable;
  deleteFilesCalls: Record<string, unknown>[] = [];
  deleteFilesError?: Error;
  policySets: IamPolicyPort[] = [];
  /** Calls to forbidden APIs: must stay empty. */
  forbidden: string[] = [];

  bucket(): BucketPort {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      file: (name: string): FilePort => self.filePort(name),
      async deleteFiles(options) {
        self.deleteFilesCalls.push(options);
        if (self.deleteFilesError) throw self.deleteFilesError;
        const prefix = String(options.prefix);
        for (const key of [...self.objects.keys()]) {
          if (key.startsWith(prefix)) self.objects.delete(key);
        }
        return [];
      },
      iam: {
        async getPolicy() {
          return [{ bindings: [] }] as [IamPolicyPort];
        },
        async setPolicy(policy) {
          self.policySets.push(policy);
          return [policy];
        },
      },
    };
  }

  private filePort(name: string): FilePort {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      async save(data, options) {
        const err = self.saveErrors.shift();
        if (err) throw err;
        if (!self.bucketExists) throw googleError(404, 'NoSuchBucket');
        if ('public' in options || 'predefinedAcl' in options) self.forbidden.push('save:acl');
        self.objects.set(name, { data, options });
        return [];
      },
      async download() {
        self.downloads.push(name);
        const o = self.objects.get(name);
        if (!o) throw googleError(404, 'No such object');
        return [o.data] as [Buffer];
      },
      async getMetadata() {
        const o = self.objects.get(name);
        if (!o) throw googleError(404, 'No such object');
        return [{ size: o.data.length }];
      },
      createReadStream() {
        const o = self.objects.get(name);
        const stream = self.createReadStreamOverride?.() ?? Readable.from(o ? [o.data] : []);
        self.readStreams.push({ name, stream });
        return stream;
      },
      async delete() {
        self.objects.delete(name);
        return [];
      },
    };
  }

  async createBucket(name: string, options: Record<string, unknown>): Promise<unknown> {
    this.createBucketCalls.push({ name, options });
    if (this.createBucketError) throw this.createBucketError;
    this.bucketExists = true;
    return [{}];
  }
}
