/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { LifecycleEnvError, readLifecycleEnv } from '../../src/connector/env';
import { lifecycleEnv } from '../helpers/lifecycle';

describe('readLifecycleEnv', () => {
  it('env: lists all missing', () => {
    try {
      readLifecycleEnv({});
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LifecycleEnvError);
      expect((error as LifecycleEnvError).missing).toEqual([
        'CTP_PROJECT_KEY',
        'CTP_API_URL',
        'CTP_AUTH_URL',
        'CTP_CLIENT_ID',
        'CTP_CLIENT_SECRET',
        'CTP_SCOPE',
        'GCP_SA_KEY_BASE64',
      ]);
    }
  });

  it('env: optional service url', () => {
    const env = readLifecycleEnv(lifecycleEnv());
    expect(env.serviceUrl).toBeUndefined();
    expect(env.vertexLocation).toBe('us-central1');
    expect(env.bigqueryDatasetId).toBe('aiassistant');
    expect(env.liteModel).toBe('gemini-3.5-flash-lite');
    expect(env.providerEnv).toEqual({});
  });

  it('env: reads the lifecycle-only service url, overrides and provider keys', () => {
    const env = readLifecycleEnv(
      lifecycleEnv({
        CONNECT_SERVICE_URL: 'https://s.example/service',
        GCP_VERTEX_LOCATION: 'europe-west4',
        STRIPE_SECRET_KEY: 'sk_test_x',
        CONTENTSTACK_REGION: '   ',
      })
    );
    expect(env.serviceUrl).toBe('https://s.example/service');
    expect(env.vertexLocation).toBe('europe-west4');
    expect(env.providerEnv).toEqual({ STRIPE_SECRET_KEY: 'sk_test_x' });
  });

  it('env: blank values count as missing', () => {
    expect(() => readLifecycleEnv(lifecycleEnv({ CTP_PROJECT_KEY: ' ' }))).toThrow(/CTP_PROJECT_KEY/);
  });
});
