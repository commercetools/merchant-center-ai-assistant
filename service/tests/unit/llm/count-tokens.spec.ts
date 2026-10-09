/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetConfigurationForTests } from '../../../src/config';
import { captureLogs } from '../../helpers/log-capture';
import { fakeKeyBase64 } from '../../helpers/gcp';
import { useEnv } from '../../helpers/use-env';

const countTokensCall = jest.fn<(args: unknown) => Promise<{ totalTokens?: number }>>();
const GoogleGenAI = jest.fn((_options: unknown) => ({ models: { countTokens: countTokensCall } }));

jest.unstable_mockModule('@google/genai', () => ({ GoogleGenAI }));

const { countTokens, describeError, resetCountTokensForTests } = await import(
  '../../../src/llm/count-tokens'
);
const { getGoogleCredentials } = await import('../../../src/gcp/credentials');

beforeEach(() => {
  GoogleGenAI.mockClear();
  countTokensCall.mockReset();
  resetCountTokensForTests();
  useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
});
afterEach(() => resetConfigurationForTests());

describe('countTokens', () => {
  it('uses Vertex through one GoogleGenAI client and returns totalTokens', async () => {
    countTokensCall.mockResolvedValue({ totalTokens: 7 });
    expect(await countTokens('hello world')).toBe(7);
    expect(await countTokens('again', 'main')).toBe(7);
    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
    const c = getGoogleCredentials();
    expect(GoogleGenAI).toHaveBeenCalledWith({
      vertexai: true,
      project: c.projectId,
      location: c.location,
      googleAuthOptions: c.googleAuthOptions,
    });
    expect(countTokensCall).toHaveBeenNthCalledWith(1, {
      model: 'gemini-2.5-flash',
      contents: 'hello world',
    });
    expect(countTokensCall).toHaveBeenNthCalledWith(2, {
      model: 'gemini-3.8-flash',
      contents: 'again',
    });
  });

  it('returns 0 when the response has no count', async () => {
    countTokensCall.mockResolvedValue({});
    expect(await countTokens('x')).toBe(0);
  });

  it('returns 0 on failure and does not log the input text', async () => {
    countTokensCall.mockRejectedValue(new Error('boom'));
    const logs = captureLogs();
    expect(await countTokens('SENTINEL-INPUT-TEXT')).toBe(0);
    logs.stop();
    expect(logs.lines.join('')).toContain('countTokens failed');
    expect(logs.lines.join('')).not.toContain('SENTINEL-INPUT-TEXT');
  });

  it('returns 0 (not a throw) when Google is not configured', async () => {
    useEnv({});
    resetCountTokensForTests();
    expect(await countTokens('x')).toBe(0);
  });
});

describe('describeError', () => {
  it('truncates and redacts key-shaped content', () => {
    expect(describeError(new Error('a'.repeat(500))).length).toBeLessThan(230);
    expect(describeError(new Error('-----BEGIN ' + 'PRIVATE KEY-----\nabc'))).toBe('Error: [redacted]');
    expect(describeError('plain')).toBe('Error: ');
  });
});
