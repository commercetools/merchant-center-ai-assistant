/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resetEnsureDatasetForTests } from '../../src/analytics/bigquery/ensure-dataset';
import { setBigQueryForTests } from '../../src/analytics/bigquery/ports';
import { resetTablesForTests } from '../../src/analytics/bigquery/tables';
import { checkGcpAnalytics } from '../../src/analytics/self-check';
import { resetConfigurationForTests } from '../../src/config';
import { resetEnsureBucketForTests } from '../../src/storage/ensure-bucket';
import { setStorageForTests } from '../../src/storage/ports';
import { FakeBigQuery, googleError } from '../helpers/bigquery-fake';
import { FAKE_BUCKET, useGcpEnv } from '../helpers/gcp-env';
import { captureLogs } from '../helpers/log-capture';
import { FakeStorage } from '../helpers/storage-fake';

let bq: FakeBigQuery;
let st: FakeStorage;

const setup = (env: NodeJS.ProcessEnv = {}) => {
  useGcpEnv(env);
  bq = new FakeBigQuery();
  st = new FakeStorage();
  setBigQueryForTests(bq);
  setStorageForTests(st);
  resetEnsureDatasetForTests();
  resetEnsureBucketForTests();
  resetTablesForTests();
};

beforeEach(() => setup());
afterEach(() => {
  setBigQueryForTests(undefined);
  setStorageForTests(undefined);
  resetConfigurationForTests();
});

const head = (status: number) => ({ head: async () => status });

describe('checkGcpAnalytics', () => {
  it('fresh project with broad roles: dataset and bucket are created, all ok, probes removed', async () => {
    bq.datasetExists = false;
    st.bucketExists = false;
    const report = await checkGcpAnalytics(head(403));
    expect(report).toEqual({ bigquery: 'ok', storage: 'ok', visibility: 'ok' });
    expect(bq.createDatasetCalls).toHaveLength(1);
    expect(st.createBucketCalls).toHaveLength(1);
    expect([...bq.tables.values()].every((t) => t.deleted)).toBe(true);
    expect(st.objects.size).toBe(0);
  });

  it('least privilege: pre-created bucket (no buckets.get needed), dataset missing but creatable', async () => {
    bq.datasetExists = false;
    const report = await checkGcpAnalytics(head(403));
    expect(report).toEqual({ bigquery: 'ok', storage: 'ok', visibility: 'ok' });
    expect(st.createBucketCalls).toHaveLength(0);
  });

  it('missing bucket and 403 on create: names storage.buckets.create and the gcloud command', async () => {
    st.bucketExists = false;
    st.createBucketError = googleError(403, 'denied');
    const report = await checkGcpAnalytics(head(403));
    expect(report.storage).toContain('storage.buckets.create');
    expect(report.storage).toContain(`gcloud storage buckets create gs://${FAKE_BUCKET}`);
    expect(report.bigquery).toBe('ok');
  });

  it('missing dataset and 403 on create: names the role and the bq command', async () => {
    bq.datasetExists = false;
    bq.createDatasetError = googleError(403, 'denied');
    const report = await checkGcpAnalytics(head(403));
    expect(report.bigquery).toContain('roles/bigquery.dataEditor');
    expect(report.bigquery).toContain('bq --location=us-central1 mk -d');
  });

  it('private mode but the probe object is anonymously readable', async () => {
    const report = await checkGcpAnalytics(head(200));
    expect(report.storage).toBe('ok');
    expect(report.visibility).toContain('IMAGE_URL_MODE=private');
    expect(report.visibility).toContain(`gcloud storage buckets remove-iam-policy-binding gs://${FAKE_BUCKET} --member=allUsers`);
  });

  it('public mode but the probe object is not readable', async () => {
    setup({ IMAGE_URL_MODE: 'public' });
    const report = await checkGcpAnalytics(head(403));
    expect(report.visibility).toContain('add-iam-policy-binding');
    expect(report.visibility).toContain('public access prevention');
    setup({ IMAGE_URL_MODE: 'public' });
    expect((await checkGcpAnalytics(head(200))).visibility).toBe('ok');
  });

  it('never throws and never logs raw Google error text', async () => {
    bq.createDatasetError = googleError(500, 'RAW-GOOGLE-TEXT project fake-project-123');
    bq.datasetExists = false;
    st.saveErrors = [googleError(500, 'RAW-GOOGLE-TEXT bucket')];
    const logs = captureLogs();
    const report = await checkGcpAnalytics({ head: async () => Promise.reject(new Error('offline')) });
    logs.stop();
    expect(report.bigquery).toContain('bigquery probe failed');
    expect(report.storage).toContain('storage probe failed');
    expect(JSON.stringify(report)).not.toContain('RAW-GOOGLE-TEXT');
    expect(logs.lines.join('')).not.toContain('RAW-GOOGLE-TEXT');
  });

  it('without a service-account key every field says so', async () => {
    useGcpEnv({ GCP_SA_KEY_BASE64: '' });
    const report = await checkGcpAnalytics();
    expect(Object.values(report).every((v) => v.includes('GCP_SA_KEY_BASE64'))).toBe(true);
  });
});
