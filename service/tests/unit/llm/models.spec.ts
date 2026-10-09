/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { resetConfigurationForTests } from '../../../src/config';
import { fakeKeyBase64 } from '../../helpers/gcp';
import { useEnv } from '../../helpers/use-env';

const languageModel = jest.fn((name: string) => ({ modelId: name }));
const createVertex = jest.fn((_settings: unknown) => ({ languageModel }));

jest.unstable_mockModule('@ai-sdk/google-vertex', () => ({ createVertex }));

const { getModel, getModelName, getProviderOptions, resetLlmForTests } = await import(
  '../../../src/llm'
);
const { GcpNotConfiguredError, getGoogleCredentials } = await import(
  '../../../src/gcp/credentials'
);

beforeEach(() => {
  createVertex.mockClear();
  languageModel.mockClear();
  resetLlmForTests();
});
afterEach(() => resetConfigurationForTests());

describe('getModel', () => {
  it('creates the Vertex provider once with project, location and the shared auth options', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GCP_VERTEX_LOCATION: 'global' });
    getModel('main');
    getModel('lite');
    expect(createVertex).toHaveBeenCalledTimes(1);
    const c = getGoogleCredentials();
    expect(createVertex).toHaveBeenCalledWith({
      project: c.projectId,
      location: 'global',
      googleAuthOptions: c.googleAuthOptions,
    });
  });

  it('maps every tier to its default model', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64() });
    expect(getModel('main')).toEqual({ modelId: 'gemini-3.8-flash' });
    expect(getModel('agent')).toEqual({ modelId: 'gemini-2.5-flash' });
    expect(getModel('lite')).toEqual({ modelId: 'gemini-3.5-flash-lite' });
    expect(getModel('image')).toEqual({ modelId: 'gemini-2.5-flash-image' });
    expect(getModelName('main')).toBe('gemini-3.8-flash');
  });

  it('overrides one tier independently', () => {
    useEnv({ GCP_SA_KEY_BASE64: fakeKeyBase64(), GEMINI_MODEL_NAME: 'custom-model' });
    expect(getModelName('main')).toBe('custom-model');
    expect(getModelName('agent')).toBe('gemini-2.5-flash');
    expect(getModelName('lite')).toBe('gemini-3.5-flash-lite');
    expect(getModelName('image')).toBe('gemini-2.5-flash-image');
  });

  it('throws GcpNotConfiguredError without a key', () => {
    useEnv({});
    expect(() => getModel('main')).toThrow(GcpNotConfiguredError);
    expect(createVertex).not.toHaveBeenCalled();
  });
});

describe('getProviderOptions', () => {
  it('reproduces the legacy thinking configuration under the vertex namespace', () => {
    useEnv({});
    expect(getProviderOptions('main')).toEqual({
      vertex: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } },
    });
    expect(getProviderOptions('agent')).toEqual({
      vertex: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } },
    });
    expect(getProviderOptions('lite')).toEqual({
      vertex: { thinkingConfig: { thinkingLevel: 'minimal' } },
    });
    expect(getProviderOptions('image')).toBeUndefined();
  });

  it('follows GEMINI_LITE_THINKING_LEVEL and never asks for thoughts on lite', () => {
    useEnv({ GEMINI_LITE_THINKING_LEVEL: 'medium' });
    const options = getProviderOptions('lite');
    expect(options).toEqual({ vertex: { thinkingConfig: { thinkingLevel: 'medium' } } });
    expect(JSON.stringify(options)).not.toContain('includeThoughts');
  });
});
