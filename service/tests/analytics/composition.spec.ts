/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { createServices, resetServicesForTests, setServicesForTests } from '../../src/services/registry';
import { setStorageForTests } from '../../src/storage/ports';
import { getImageUploader, registry, setImageUploader } from '../../src/tool-sources';
import { imageGenerationSource } from '../../src/tool-sources/image-generation.source';
import { fakeKeyBase64 } from '../helpers/gcp';
import { makeToolContext } from '../helpers/stub-tool-source';
import { freshConfig } from '../helpers/env';
import { makePersistence } from '../helpers/persistence';
import { FakeBigQuery } from '../helpers/bigquery-fake';
import { FAKE_BUCKET, useGcpEnv } from '../helpers/gcp-env';
import { FakeStorage } from '../helpers/storage-fake';

afterEach(() => {
  setImageUploader(undefined);
  setBigQueryForTests(undefined);
  setStorageForTests(undefined);
  resetServicesForTests();
  resetConfigurationForTests();
});

describe('change L composition', () => {
  it('the bigquery source is registered with the process-wide registry', () => {
    expect(registry.list().map((s) => s.name)).toContain('bigquery');
  });

  it('image generation is enabled with a service-account key, WITHOUT GCP_BUCKET_NAME', async () => {
    createApp(freshConfig({ GCP_SA_KEY_BASE64: fakeKeyBase64() }));
    expect(getImageUploader()).toBeDefined();
    const ctx = makeToolContext();
    expect(await imageGenerationSource.isEnabled(ctx)).toBe(true);
  });

  it('image generation is disabled without a service-account key (even with a bucket name)', async () => {
    createApp(freshConfig({ GCP_BUCKET_NAME: 'some-bucket-name' }));
    expect(getImageUploader()).toBeUndefined();
    expect(await imageGenerationSource.isEnabled(makeToolContext())).toBe(false);
  });

  describe('session deletion runs both cleanup hooks', () => {
    let bq: FakeBigQuery;
    let st: FakeStorage;

    beforeEach(() => {
      useGcpEnv();
      bq = new FakeBigQuery();
      st = new FakeStorage();
      setBigQueryForTests(bq);
      setStorageForTests(st);
    });

    it('drops the session tables and deletes the image prefix', async () => {
      const { p } = makePersistence(undefined, { GCP_SA_KEY_BASE64: fakeKeyBase64() });
      useGcpEnv();
      const services = createServices(p);
      setServicesForTests(services);
      const user = { userId: 'u1', projectKey: 'p', isAdmin: false };
      const session = await services.sessions.create(user, {});
      const tableId = `${session.id.replace(/-/g, '_')}_read_orders`;
      bq.tables.set(tableId, { id: tableId, rows: [], options: {}, deleted: false, metadata: {} });
      await services.sessions.addTemporaryTable(session.id, user, {
        tableRef: `fake-project-123.aiassistant.${tableId}`,
        toolName: 'read_orders',
        args: '{}',
      });
      st.objects.set(`images/${session.id}/1700000000000-ab12cd34.png`, { data: Buffer.from('x'), options: {} });

      await services.sessions.remove(session.id, user);

      expect(bq.tables.get(tableId)!.deleted).toBe(true);
      expect(st.objects.size).toBe(0);
    });
  });

  it('GET /service/files/... is mounted behind the session check (401 without a token)', async () => {
    const app = createApp(freshConfig({ CONNECT_SERVICE_URL: 'https://mc.example.test' }));
    const res = await request(app).get(
      '/service/files/3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab/1700000000000-ab12cd34.png'
    );
    expect(res.status).toBe(401);
  });

  it('registration does not touch Google at import time (no key, no throw)', () => {
    expect(() => createApp(freshConfig())).not.toThrow();
    expect(FAKE_BUCKET).toBeDefined();
  });
});
