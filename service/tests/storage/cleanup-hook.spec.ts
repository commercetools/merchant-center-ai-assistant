/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resetConfigurationForTests } from '../../src/config';
import { imageCleanupHook } from '../../src/storage/cleanup-hook';
import { setStorageForTests } from '../../src/storage/ports';
import type { ChatSession } from '../../src/types/chat.types';
import { googleError } from '../helpers/bigquery-fake';
import { useGcpEnv } from '../helpers/gcp-env';
import { FakeStorage } from '../helpers/storage-fake';

const SESSION = '3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab';
let st: FakeStorage;

const session = (id = SESSION): ChatSession => ({ id, userId: 'u1', createdAt: 1, updatedAt: 1, schemaVersion: 1 });
const put = (name: string) => st.objects.set(name, { data: Buffer.from('x'), options: {} });

beforeEach(() => {
  useGcpEnv();
  st = new FakeStorage();
  setStorageForTests(st);
});
afterEach(() => {
  setStorageForTests(undefined);
  resetConfigurationForTests();
});

describe('image cleanup hook', () => {
  it('deletes the session prefix (with a trailing slash) and nothing else', async () => {
    put(`images/${SESSION}/a.png`);
    put(`images/${SESSION}/b.png`);
    put(`images/${SESSION}9999/c.png`);
    await imageCleanupHook(session());
    expect(st.deleteFilesCalls).toEqual([{ prefix: `images/${SESSION}/` }]);
    expect([...st.objects.keys()]).toEqual([`images/${SESSION}9999/c.png`]);
  });

  it('a missing bucket (404) is success, any other error is swallowed', async () => {
    st.deleteFilesError = googleError(404, 'NoSuchBucket');
    await expect(imageCleanupHook(session())).resolves.toBeUndefined();
    st.deleteFilesError = googleError(500, 'boom');
    await expect(imageCleanupHook(session())).resolves.toBeUndefined();
  });

  it('is skipped without a service-account key', async () => {
    useGcpEnv({ GCP_SA_KEY_BASE64: '' });
    await imageCleanupHook(session());
    expect(st.deleteFilesCalls).toEqual([]);
  });
});
