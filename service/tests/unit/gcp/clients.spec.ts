/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetConfigurationForTests } from '../../../src/config';
import { fakeKeyBase64 } from '../../helpers/gcp';
import { useEnv } from '../../helpers/use-env';

const BigQuery = jest.fn((_options: unknown) => ({ kind: 'bigquery' }));
const Storage = jest.fn((_options: unknown) => ({ kind: 'storage' }));
const GoogleGenAI = jest.fn((_options: unknown) => ({ models: { countTokens: jest.fn() } }));
const createVertex = jest.fn((_options: unknown) => ({ languageModel: jest.fn() }));

jest.unstable_mockModule('@google-cloud/bigquery', () => ({ BigQuery }));
jest.unstable_mockModule('@google-cloud/storage', () => ({ Storage }));
jest.unstable_mockModule('@google/genai', () => ({ GoogleGenAI }));
jest.unstable_mockModule('@ai-sdk/google-vertex', () => ({ createVertex }));

const clients = await import('../../../src/gcp/clients');
const { getGoogleCredentials, GcpNotConfiguredError } = await import(
  '../../../src/gcp/credentials'
);
const { getModel, resetLlmForTests } = await import('../../../src/llm/models');
const { countTokens, resetCountTokensForTests } = await import('../../../src/llm/count-tokens');

beforeEach(() => {
  for (const m of [BigQuery, Storage, GoogleGenAI, createVertex]) m.mockClear();
  clients.resetGcpClientsForTests();
  resetLlmForTests();
  resetCountTokensForTests();
});
afterEach(() => resetConfigurationForTests());

describe('BigQuery and Storage clients', () => {
  it('pass credentials, never a key file, and are singletons', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GCP_BIGQUERY_LOCATION: 'EU' });
    const c = getGoogleCredentials();
    const bq = clients.getBigQueryClient();
    const st = clients.getStorageClient();
    expect(clients.getBigQueryClient()).toBe(bq);
    expect(clients.getStorageClient()).toBe(st);
    expect(BigQuery).toHaveBeenCalledTimes(1);
    expect(Storage).toHaveBeenCalledTimes(1);
    expect(BigQuery).toHaveBeenCalledWith({
      projectId: c.projectId,
      credentials: c.credentials,
      location: 'EU',
    });
    expect(Storage).toHaveBeenCalledWith({ projectId: c.projectId, credentials: c.credentials });
    for (const call of [...BigQuery.mock.calls, ...Storage.mock.calls]) {
      expect(call[0]).not.toHaveProperty('keyFilename');
    }
  });

  it('throws GcpNotConfiguredError without a key', () => {
    useEnv({});
    expect(() => clients.getBigQueryClient()).toThrow(GcpNotConfiguredError);
    expect(() => clients.getStorageClient()).toThrow(GcpNotConfiguredError);
    expect(() => clients.requireBucketName()).toThrow(GcpNotConfiguredError);
  });

  it('derives the bucket name from the project', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GCP_PROJECT_ID: 'acme-dev-123' });
    expect(clients.requireBucketName()).toBe('acme-dev-123-ai-assistant-images');
  });

  it('prefers an explicit bucket name', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GCP_BUCKET_NAME: 'my-images' });
    expect(clients.requireBucketName()).toBe('my-images');
  });

  it('exposes the dataset id from configuration', () => {
    useEnv({});
    expect(clients.getDatasetId()).toBe('aiassistant');
    useEnv({ GCP_BIGQUERY_DATASET_ID: 'other_ds' });
    expect(clients.getDatasetId()).toBe('other_ds');
  });
});

describe('one source of truth', () => {
  it('builds Vertex, GoogleGenAI, BigQuery and Storage from getGoogleCredentials()', async () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
    const c = getGoogleCredentials();
    getModel('main');
    await countTokens('x');
    clients.getBigQueryClient();
    clients.getStorageClient();

    expect(createVertex).toHaveBeenCalledWith(
      expect.objectContaining({ project: c.projectId, googleAuthOptions: c.googleAuthOptions })
    );
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ vertexai: true, googleAuthOptions: c.googleAuthOptions })
    );
    expect(BigQuery).toHaveBeenCalledWith(expect.objectContaining({ credentials: c.credentials }));
    expect(Storage).toHaveBeenCalledWith(expect.objectContaining({ credentials: c.credentials }));
  });
});
