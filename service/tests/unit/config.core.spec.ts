/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration, resetConfigurationForTests } from '../../src/config';
import { baseEnv } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

describe('readConfiguration', () => {
  it('returns every section', () => {
    const config = readConfiguration(baseEnv());
    expect(Object.keys(config).sort()).toEqual(
      [
        'auth',
        'cache',
        'ctp',
        'gcp',
        'llm',
        'persistence',
        'providers',
        'server',
      ].sort()
    );
  });

  it('reports several problems together and never a value', () => {
    const env = baseEnv({ CTP_PROJECT_KEY: '', LOG_LEVEL: 'loud' });
    let message = '';
    try {
      readConfiguration(env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('CTP_PROJECT_KEY');
    expect(message).toContain('LOG_LEVEL');
    expect(message).not.toContain('loud');
  });

  it('does not leak a secret-looking value of an invalid key', () => {
    const env = baseEnv({ CTP_API_URL: 'http://hunter2.invalid', PERSISTENCE_DRIVER: '' });
    expect(() => readConfiguration(env)).toThrow(/CTP_API_URL/);
    try {
      readConfiguration(env);
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2');
    }
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => readConfiguration(baseEnv({ NODE_ENV: 'staging' }))).toThrow(
      /NODE_ENV/
    );
  });

  it('defaults NODE_ENV to production', () => {
    const env = baseEnv({ PERSISTENCE_DRIVER: 'custom-objects' });
    delete env.NODE_ENV;
    // production + missing credentials: the credential keys are named.
    expect(() => readConfiguration(env)).toThrow(/CTP_CLIENT_ID/);
  });

  it('returns the same frozen object on the second call', () => {
    const first = readConfiguration(baseEnv());
    const second = readConfiguration(baseEnv({ LOG_LEVEL: 'debug' }));
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.server)).toBe(true);
    expect(Object.isFrozen(first.auth)).toBe(true);
  });
});
