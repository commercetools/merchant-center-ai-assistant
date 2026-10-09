/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Live Cloud Storage test of the image helpers. Runs only through `npm run test:integration`
 * and only when GCP_SA_KEY_BASE64 is set (service/.env.local or the environment); otherwise the
 * suite is skipped. It stores one 1x1 PNG under a random session id, reads it back, removes it
 * with the session cleanup hook and checks that nothing is left (the E2E-L-07 condition).
 */
import { randomUUID } from 'node:crypto';
import { resetConfigurationForTests } from '../../src/config';
import { getStorageClient, requireBucketName } from '../../src/gcp/clients';
import { resetEnsureBucketForTests } from '../../src/storage/ensure-bucket';
import { imageCleanupHook } from '../../src/storage/cleanup-hook';
import { putImage } from '../../src/storage/gcs-objects';
import { useEnv } from '../helpers/use-env';

const live = Boolean(process.env.GCP_SA_KEY_BASE64);
const suite = live ? describe : describe.skip;
const kept = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => /^(GCP_|IMAGE_URL_MODE)/.test(k))
);

// A valid 1x1 transparent PNG.
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  )
);

suite('image storage (live)', () => {
  const sessionId = randomUUID();
  const listObjects = async (): Promise<string[]> => {
    const [files] = await getStorageClient()
      .bucket(requireBucketName())
      .getFiles({ prefix: `images/${sessionId}/` });
    return files.map((f) => f.name);
  };

  beforeAll(() => {
    useEnv(kept);
    resetEnsureBucketForTests();
  });
  afterAll(async () => {
    await imageCleanupHook({ id: sessionId } as never).catch(() => undefined);
    resetConfigurationForTests();
  });

  it('stores an image, reads it back and the cleanup hook leaves nothing', async () => {
    const { objectName } = await putImage(PNG, 'image/png', sessionId);
    expect(objectName.startsWith(`images/${sessionId}/`)).toBe(true);

    const [bytes] = await getStorageClient().bucket(requireBucketName()).file(objectName).download();
    expect(Buffer.compare(bytes, Buffer.from(PNG))).toBe(0);
    expect(await listObjects()).toEqual([objectName]);

    await imageCleanupHook({ id: sessionId } as never);
    expect(await listObjects()).toEqual([]);
  }, 120_000);
});
