/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { freshConfig, fullCtpEnv } from '../helpers/env';
import { fakeKeyBase64 } from '../helpers/gcp';

beforeEach(() => resetConfigurationForTests());

describe('production guards', () => {
  it('refuses MC_AUTH_DISABLED=true in production', () => {
    expect(() =>
      freshConfig({
        NODE_ENV: 'production',
        PERSISTENCE_DRIVER: 'custom-objects',
        ...fullCtpEnv,
        MC_AUTH_DISABLED: 'true',
      })
    ).toThrow(/MC_AUTH_DISABLED/);
  });

  it('refuses the memory driver in production', () => {
    expect(() => freshConfig({ NODE_ENV: 'production' })).toThrow(
      /PERSISTENCE_DRIVER/
    );
  });

  it('refuses both when production is the default', () => {
    const env = { MC_AUTH_DISABLED: 'true' };
    let message = '';
    try {
      freshConfig({ NODE_ENV: '', ...env });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('MC_AUTH_DISABLED');
    expect(message).toContain('PERSISTENCE_DRIVER');
  });

  it('allows both outside production', () => {
    const c = freshConfig({ NODE_ENV: 'development', MC_AUTH_DISABLED: 'true' });
    expect(c.auth.authDisabled).toBe(true);
    expect(c.persistence.driver).toBe('memory');
  });

  it('accepts a valid production configuration', () => {
    const c = freshConfig({
      NODE_ENV: 'production',
      PERSISTENCE_DRIVER: '',
      GCP_SA_KEY_BASE64: fakeKeyBase64(),
      ...fullCtpEnv,
    });
    expect(c.persistence.driver).toBe('custom-objects');
  });
});
