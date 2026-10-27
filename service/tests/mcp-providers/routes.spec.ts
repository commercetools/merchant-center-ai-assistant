/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { getProviderStatuses } from '../../src/mcp-providers/status';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

const SENTINELS = {
  STRIPE_SECRET_KEY: 'sk_test_SENTINEL',
  ALGOLIA_MCP_URL: 'https://sentinel.example.com/mcp',
  CONTENTSTACK_API_KEY: 'cs_key_SENTINEL',
  CONTENTSTACK_MANAGEMENT_TOKEN: 'cs_token_SENTINEL',
};

const app = (extra: NodeJS.ProcessEnv = {}) =>
  createApp(freshConfig({ MC_AUTH_DISABLED: 'true', ...extra }));

describe('GET /service/mcp/providers', () => {
  it('any member (non-admin, forged admin e-mail) gets the three entries', async () => {
    const res = await request(app({ ADMIN_USER_IDS: 'admin-1' }))
      .get('/service/mcp/providers?userEmail=admin@example.test')
      .set('x-dev-user-id', 'member-2')
      .set('x-admin-email', 'admin@example.test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [
        {
          provider: 'contentstack',
          configured: false,
          enabled: false,
          missingKeys: [
            'CONTENTSTACK_API_KEY',
            'CONTENTSTACK_MANAGEMENT_TOKEN',
          ],
        },
        {
          provider: 'algolia',
          configured: false,
          enabled: false,
          missingKeys: ['ALGOLIA_MCP_URL'],
        },
        {
          provider: 'stripe',
          configured: false,
          enabled: false,
          missingKeys: ['STRIPE_SECRET_KEY'],
        },
      ],
    });
  });

  it('the same data for an admin and a member', async () => {
    const a = app({
      ADMIN_USER_IDS: 'admin-1',
      STRIPE_SECRET_KEY: 'sk_test_abc',
    });
    const asAdmin = await request(a)
      .get('/service/mcp/providers')
      .set('x-dev-user-id', 'admin-1')
      .set('x-dev-admin', 'true');
    const asMember = await request(a)
      .get('/service/mcp/providers')
      .set('x-dev-user-id', 'member-2');
    expect(asAdmin.status).toBe(200);
    expect(asMember.body).toEqual(asAdmin.body);
    expect(asMember.body.data[2]).toEqual({
      provider: 'stripe',
      configured: true,
      enabled: true,
      missingKeys: [],
    });
  });

  it('reports a mix of configured, partial and absent providers', async () => {
    const res = await request(
      app({ STRIPE_SECRET_KEY: 'sk_test_abc', CONTENTSTACK_API_KEY: 'k' })
    ).get('/service/mcp/providers');
    expect(
      res.body.data.map(
        (d: { provider: string; configured: boolean; enabled: boolean }) => [
          d.provider,
          d.configured,
          d.enabled,
        ]
      )
    ).toEqual([
      ['contentstack', false, false],
      ['algolia', false, false],
      ['stripe', true, true],
    ]);
    expect(res.body.data[0].missingKeys).toEqual([
      'CONTENTSTACK_MANAGEMENT_TOKEN',
    ]);
  });

  it('no sentinel value is serialised', async () => {
    const res = await request(app(SENTINELS)).get('/service/mcp/providers');
    expect(res.status).toBe(200);
    expect(res.body.data.every((d: { enabled: boolean }) => d.enabled)).toBe(
      true
    );
    const text = JSON.stringify(res.body);
    for (const v of Object.values(SENTINELS)) expect(text).not.toContain(v);
    expect(text).not.toContain('SENTINEL');
    expect(text).not.toContain('sentinel.example');
    for (const entry of res.body.data) {
      expect(Object.keys(entry).sort()).toEqual([
        'configured',
        'enabled',
        'missingKeys',
        'provider',
      ]);
    }
  });

  it.each([
    ['POST', '/service/mcp/providers'],
    ['PUT', '/service/mcp/providers'],
    ['DELETE', '/service/mcp/providers'],
    ['GET', '/service/mcp/configs'],
    ['POST', '/service/mcp/configs'],
    ['POST', '/service/mcp/configs/upsert'],
    ['PUT', '/service/mcp/configs/abc'],
    ['DELETE', '/service/mcp/configs/abc'],
  ])('%s %s is 404', async (method, path) => {
    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    const res = await request(app())[verb](path).send({ provider: 'stripe' });
    expect(res.status).toBe(404);
  });

  it('is rejected without a verified session', async () => {
    resetConfigurationForTests();
    const real = createApp(
      freshConfig({ CONNECT_SERVICE_URL: 'https://svc.example.test' })
    );
    const res = await request(real).get('/service/mcp/providers');
    expect([401, 403]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('configured');
  });
});

describe('getProviderStatuses', () => {
  it('is pure, ordered and independent of the section object identity', () => {
    const c = freshConfig({ STRIPE_SECRET_KEY: 'sk_test_abc' });
    const first = getProviderStatuses(c.providers);
    first[0].missingKeys.push('mutated');
    expect(getProviderStatuses(c.providers)[0].missingKeys).not.toContain(
      'mutated'
    );
    expect(first.map((s) => s.provider)).toEqual([
      'contentstack',
      'algolia',
      'stripe',
    ]);
  });
});
