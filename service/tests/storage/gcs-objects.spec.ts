/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resetConfigurationForTests } from '../../src/config';
import { BucketUnavailableError, ensureBucket, resetEnsureBucketForTests } from '../../src/storage/ensure-bucket';
import { ImageRejectedError, putImage } from '../../src/storage/gcs-objects';
import { setStorageForTests } from '../../src/storage/ports';
import { createGcsImageUploader } from '../../src/storage/uploader';
import { googleError } from '../helpers/bigquery-fake';
import { FAKE_BUCKET, useGcpEnv } from '../helpers/gcp-env';
import { captureLogs } from '../helpers/log-capture';
import { FakeStorage } from '../helpers/storage-fake';

const SESSION = '3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab';
const PNG = new Uint8Array([137, 80, 78, 71]);
let st: FakeStorage;

const setup = (env: NodeJS.ProcessEnv = {}) => {
  useGcpEnv(env);
  st = new FakeStorage();
  setStorageForTests(st);
  resetEnsureBucketForTests();
};

beforeEach(() => setup());
afterEach(() => {
  setStorageForTests(undefined);
  resetConfigurationForTests();
});

describe('putImage', () => {
  it('rejects SVG and any other type', async () => {
    await expect(putImage(PNG, 'image/svg+xml', SESSION)).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(putImage(PNG, 'text/html', SESSION)).rejects.toBeInstanceOf(ImageRejectedError);
    expect(st.objects.size).toBe(0);
  });

  it('rejects 12 MB and names the size', async () => {
    const error = await putImage(new Uint8Array(12 * 1024 * 1024), 'image/png', SESSION).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageRejectedError);
    expect((error as Error).message).toContain(String(12 * 1024 * 1024));
  });

  it('private mode: object path pattern, relative path, no ACL, private cache control', async () => {
    const r = await putImage(PNG, 'image/png', SESSION);
    expect(r.objectName).toMatch(new RegExp(`^images/${SESSION}/[0-9]{10,15}-[a-f0-9]{8}\\.png$`));
    expect(r.value).toBe(`/files/${SESSION}/${r.objectName.split('/')[2]}`);
    expect(r.value).not.toContain('http');
    expect(r.value).not.toContain('X-Goog-');
    const saved = st.objects.get(r.objectName)!;
    expect(saved.options).not.toHaveProperty('public');
    expect(saved.options).not.toHaveProperty('predefinedAcl');
    expect(saved.options.metadata).toEqual({ contentType: 'image/png', cacheControl: 'private, no-store' });
    expect(st.forbidden).toEqual([]);
    expect(st.policySets).toEqual([]);
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ])('%s is stored with .%s', async (type, ext) => {
    expect((await putImage(PNG, type, SESSION)).objectName.endsWith(`.${ext}`)).toBe(true);
  });

  it('public mode returns the bucket URL with a public cache header and sets no policy on an existing bucket', async () => {
    setup({ IMAGE_URL_MODE: 'public' });
    const r = await putImage(PNG, 'image/png', SESSION);
    expect(r.value).toBe(`https://storage.googleapis.com/${FAKE_BUCKET}/${r.objectName}`);
    expect(st.objects.get(r.objectName)!.options.metadata).toMatchObject({ cacheControl: 'public, max-age=3600' });
    expect(st.policySets).toEqual([]);
  });
});

describe('idempotent bucket bootstrap', () => {
  it('404 creates the bucket once (parallel uploads share one create) and both succeed', async () => {
    st.bucketExists = false;
    const [a, b] = await Promise.all([putImage(PNG, 'image/png', SESSION), putImage(PNG, 'image/png', SESSION)]);
    expect(st.createBucketCalls).toHaveLength(1);
    expect(st.createBucketCalls[0]).toEqual({
      name: FAKE_BUCKET,
      options: {
        location: 'us-central1',
        iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' },
      },
    });
    expect(st.objects.has(a.objectName) && st.objects.has(b.objectName)).toBe(true);
  });

  it('public mode creates without enforcement and adds the bucket-level binding on creation only', async () => {
    setup({ IMAGE_URL_MODE: 'public', GCP_BUCKET_LOCATION: 'europe-west1' });
    st.bucketExists = false;
    await putImage(PNG, 'image/png', SESSION);
    expect(st.createBucketCalls[0].options).toMatchObject({
      location: 'europe-west1',
      iamConfiguration: { publicAccessPrevention: 'inherited' },
    });
    expect(st.policySets).toHaveLength(1);
    expect(st.policySets[0].bindings).toEqual([{ role: 'roles/storage.objectViewer', members: ['allUsers'] }]);
  });

  it('403 on create: the upload fails, ONE error line names the permission and the command, no retry storm', async () => {
    st.bucketExists = false;
    st.createBucketError = googleError(403, 'Access Denied: caller does not have storage.buckets.create on project fake-project-123');
    const logs = captureLogs();
    const uploader = createGcsImageUploader();
    expect(await uploader.upload(PNG, 'image/png', SESSION)).toBe('');
    expect(await uploader.upload(PNG, 'image/png', SESSION)).toBe('');
    logs.stop();
    expect(st.createBucketCalls).toHaveLength(1);
    const errorLines = logs.lines.filter((l) => l.includes('storage.buckets.create'));
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]).toContain(`gcloud storage buckets create gs://${FAKE_BUCKET} --location=us-central1 --uniform-bucket-level-access --public-access-prevention`);
    expect(errorLines[0]).toContain('roles/storage.admin');
    expect(errorLines[0]).toContain('roles/storage.objectAdmin');
    expect(errorLines[0]).not.toContain('Access Denied');
  });

  it('409 already exists is success and never modifies the bucket', async () => {
    st.createBucketError = googleError(409, 'You already own this bucket');
    await expect(ensureBucket()).resolves.toBeUndefined();
    expect(st.policySets).toEqual([]);
  });

  it('the error type is exported for callers', async () => {
    st.createBucketError = googleError(403, 'denied');
    await expect(ensureBucket()).rejects.toBeInstanceOf(BucketUnavailableError);
  });
});

describe('uploader', () => {
  it('returns the stored path, and an empty string (with a warning) for a rejected image', async () => {
    const uploader = createGcsImageUploader();
    expect(await uploader.upload(PNG, 'image/png', SESSION)).toMatch(new RegExp(`^/files/${SESSION}/`));
    const logs = captureLogs();
    expect(await uploader.upload(PNG, 'image/svg+xml', SESSION)).toBe('');
    logs.stop();
    expect(logs.lines.join('')).toContain('not stored');
  });

  it('an unexpected storage error yields an empty string', async () => {
    st.saveErrors = [googleError(500, 'boom')];
    expect(await createGcsImageUploader().upload(PNG, 'image/png', SESSION)).toBe('');
  });
});
