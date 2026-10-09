/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetConfigurationForTests } from '../../../src/config';
import { fakeKeyBase64 } from '../../helpers/gcp';
import { useEnv } from '../../helpers/use-env';

const SECRET_TOKEN = 'ya29.SECRET-TOKEN-VALUE';

const getAccessToken = jest.fn<() => Promise<string | null | undefined>>();
const GoogleAuth = jest.fn((_options: unknown) => ({ getAccessToken }));
const countTokensCall = jest.fn<() => Promise<{ totalTokens?: number }>>();
const GoogleGenAI = jest.fn((_options: unknown) => ({ models: { countTokens: countTokensCall } }));
const createQueryJob = jest.fn<(options: unknown) => Promise<unknown>>();
const BigQuery = jest.fn((_options: unknown) => ({ createQueryJob }));
const exists = jest.fn<() => Promise<[boolean]>>();
const bucket = jest.fn((_name: string) => ({ exists }));
const Storage = jest.fn((_options: unknown) => ({ bucket }));

jest.unstable_mockModule('google-auth-library', () => ({ GoogleAuth }));
jest.unstable_mockModule('@google/genai', () => ({ GoogleGenAI }));
jest.unstable_mockModule('@google-cloud/bigquery', () => ({ BigQuery }));
jest.unstable_mockModule('@google-cloud/storage', () => ({ Storage }));

const { checkGcpReadiness } = await import('../../../src/gcp/readiness');
const { resetGcpClientsForTests } = await import('../../../src/gcp/clients');
const { resetCountTokensForTests } = await import('../../../src/llm/count-tokens');

function names(report: { checks: Array<{ name: string; ok: boolean }> }) {
  return Object.fromEntries(report.checks.map((c) => [c.name, c.ok]));
}

beforeEach(() => {
  getAccessToken.mockReset().mockResolvedValue(SECRET_TOKEN);
  countTokensCall.mockReset().mockResolvedValue({ totalTokens: 1 });
  createQueryJob.mockReset().mockResolvedValue([{}]);
  exists.mockReset().mockResolvedValue([true]);
  resetGcpClientsForTests();
  resetCountTokensForTests();
  useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
});
afterEach(() => resetConfigurationForTests());

describe('checkGcpReadiness', () => {
  it('passes the shallow checks', async () => {
    const report = await checkGcpReadiness();
    expect(report.ok).toBe(true);
    expect(names(report)).toEqual({ decode: true, token: true, vertex: true });
  });

  it('adds the deep checks, using a dry run and the effective bucket', async () => {
    const report = await checkGcpReadiness({ deep: true });
    expect(report.ok).toBe(true);
    expect(names(report)).toEqual({
      decode: true,
      token: true,
      vertex: true,
      bigquery: true,
      storage: true,
    });
    expect(createQueryJob).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'SELECT 1', dryRun: true })
    );
    expect(bucket).toHaveBeenCalledWith('fake-project-123-ai-assistant-images');
  });

  it('reports a missing key without trying anything else', async () => {
    useEnv({});
    const report = await checkGcpReadiness({ deep: true });
    expect(report.ok).toBe(false);
    expect(report.checks).toHaveLength(1);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('fails the token check with a fixed reason when Google rejects the key', async () => {
    getAccessToken.mockRejectedValue(new Error(`invalid_grant ${SECRET_TOKEN}`));
    const report = await checkGcpReadiness();
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'token')).toEqual({
      name: 'token',
      ok: false,
      detail: 'access token could not be minted',
    });
  });

  it('treats a zero token count as a Vertex failure', async () => {
    countTokensCall.mockRejectedValue(new Error('403'));
    const report = await checkGcpReadiness();
    expect(names(report).vertex).toBe(false);
    expect(report.checks.find((c) => c.name === 'vertex')?.detail).toBe('countTokens failed');
  });

  it('reports a missing bucket as ok with detail "missing"', async () => {
    exists.mockResolvedValue([false]);
    const storage = (await checkGcpReadiness({ deep: true })).checks.find(
      (c) => c.name === 'storage'
    );
    expect(storage).toEqual({ name: 'storage', ok: true, detail: 'missing' });
  });

  it('reports a 403 on the bucket as ok with a role hint', async () => {
    exists.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 403 }));
    const storage = (await checkGcpReadiness({ deep: true })).checks.find(
      (c) => c.name === 'storage'
    );
    expect(storage).toEqual({
      name: 'storage',
      ok: true,
      detail: 'not inspectable with the current roles',
    });
  });

  it('fails the BigQuery check on any error', async () => {
    createQueryJob.mockRejectedValue(new Error('nope'));
    const report = await checkGcpReadiness({ deep: true });
    expect(names(report).bigquery).toBe(false);
  });

  it('never leaks tokens or key material in any detail, and never throws', async () => {
    getAccessToken.mockRejectedValue(new Error(SECRET_TOKEN));
    createQueryJob.mockRejectedValue(new Error(SECRET_TOKEN));
    exists.mockRejectedValue(new Error(SECRET_TOKEN));
    const text = JSON.stringify(await checkGcpReadiness({ deep: true }));
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain('private_key');
    expect(text).not.toContain('BEGIN');
  });

  it('times out a hanging check instead of waiting', async () => {
    jest.useFakeTimers();
    try {
      getAccessToken.mockReturnValue(new Promise(() => undefined));
      const pending = checkGcpReadiness();
      await jest.advanceTimersByTimeAsync(8_001);
      const report = await pending;
      expect(report.checks.find((c) => c.name === 'token')?.detail).toBe('timed out');
    } finally {
      jest.useRealTimers();
    }
  });
});
