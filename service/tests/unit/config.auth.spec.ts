/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

describe('auth section: MC_AUDIENCE', () => {
  it('is optional at boot', () => {
    expect(freshConfig().auth.mcAudience).toBeUndefined();
  });

  it('stores the origin', () => {
    expect(freshConfig({ MC_AUDIENCE: 'https://svc.example.test/' }).auth.mcAudience).toBe(
      'https://svc.example.test'
    );
  });

  it.each([
    'https://x.example/service',
    'https://x.example?a=1',
    'https://x.example/#f',
    'not a url',
    'ftp://x.example',
  ])('rejects %s', (value) => {
    expect(() => freshConfig({ MC_AUDIENCE: value })).toThrow(/MC_AUDIENCE/);
  });

  it('allows http outside production only', () => {
    expect(freshConfig({ MC_AUDIENCE: 'http://localhost:8080' }).auth.mcAudience).toBe(
      'http://localhost:8080'
    );
    expect(() =>
      freshConfig({ NODE_ENV: 'production', MC_AUDIENCE: 'http://x.example' })
    ).toThrow(/MC_AUDIENCE/);
  });
});

describe('auth section: issuer', () => {
  it('defaults to the cloud identifier of CTP_REGION', () => {
    expect(freshConfig().auth.issuerCloudIdentifier).toBe('gcp-us');
    expect(freshConfig({ CTP_REGION: 'europe-west1.gcp' }).auth.issuerCloudIdentifier).toBe(
      'gcp-eu'
    );
  });

  it('can be overridden', () => {
    expect(freshConfig({ MC_CLOUD_IDENTIFIER: 'aws-eu' }).auth.issuerCloudIdentifier).toBe(
      'aws-eu'
    );
  });

  it('rejects an unknown override', () => {
    expect(() => freshConfig({ MC_CLOUD_IDENTIFIER: 'mars' })).toThrow(/MC_CLOUD_IDENTIFIER/);
  });
});

describe('auth section: entry point and bypass', () => {
  it('defaults the entry point path and validates it', () => {
    expect(freshConfig().auth.entryPointUriPath).toBe('ai-assistant');
    expect(() => freshConfig({ MC_APP_ENTRY_POINT_URI_PATH: 'Bad Path' })).toThrow(
      /MC_APP_ENTRY_POINT_URI_PATH/
    );
  });

  it('allows the bypass outside production', () => {
    expect(freshConfig({ MC_AUTH_DISABLED: 'true' }).auth.authDisabled).toBe(true);
  });

  it('refuses the bypass in production with the specified message', () => {
    expect(() =>
      freshConfig({ NODE_ENV: 'production', MC_AUTH_DISABLED: 'true' })
    ).toThrow('MC_AUTH_DISABLED: must not be enabled in production');
  });

  it('accepts exactly true or false', () => {
    expect(() => freshConfig({ MC_AUTH_DISABLED: 'yes' })).toThrow(/MC_AUTH_DISABLED/);
  });
});

describe('auth section: MCP_BINDING_OPEN_TO_ALL', () => {
  it('is off by default and accepts exactly true or false', () => {
    expect(freshConfig().auth.mcpBindingOpenToAll).toBe(false);
    expect(freshConfig({ MCP_BINDING_OPEN_TO_ALL: 'true' }).auth.mcpBindingOpenToAll).toBe(true);
    expect(() => freshConfig({ MCP_BINDING_OPEN_TO_ALL: 'yes' })).toThrow(/MCP_BINDING_OPEN_TO_ALL/);
  });
});

describe('auth section: ADMIN_USER_IDS', () => {
  it('is an empty set when unset', () => {
    expect(freshConfig().auth.adminUserIds.size).toBe(0);
  });

  it('normalises the list', () => {
    expect(freshConfig({ ADMIN_USER_IDS: ' u1, u2 ;u1,, ' }).auth.adminUserIds).toEqual(
      new Set(['u1', 'u2'])
    );
  });

  it('reports an invalid entry by position without echoing it', () => {
    let message = '';
    try {
      freshConfig({ ADMIN_USER_IDS: 'u1,bad id', LOG_LEVEL: 'loud' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('ADMIN_USER_IDS: entry 2 is not a valid user id');
    expect(message).toContain('LOG_LEVEL');
    expect(message).not.toContain('bad id');
  });

  it('rejects 51 entries', () => {
    const many = Array.from({ length: 51 }, (_, i) => `u-${i}`).join(',');
    expect(() => freshConfig({ ADMIN_USER_IDS: many })).toThrow(/ADMIN_USER_IDS/);
  });
});
