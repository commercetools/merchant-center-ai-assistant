/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

describe('GET /service/status', () => {
  it('is up without authentication', async () => {
    const res = await request(createApp(freshConfig())).get('/service/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'UP',
      service: 'ai-assistant',
      persistence: 'memory',
      authConfigured: false,
      adminConfigured: false,
    });
    expect(typeof res.body.version).toBe('string');
    expect(Object.keys(res.body).sort()).toEqual(
      ['adminConfigured', 'authConfigured', 'persistence', 'service', 'status', 'version']
    );
  });

  it('reports the audience once configured', async () => {
    const res = await request(
      createApp(freshConfig({ MC_AUDIENCE: 'https://svc.example.test' }))
    ).get('/service/status');
    expect(res.body.authConfigured).toBe(true);
  });

  it('reports adminConfigured but never the ids', async () => {
    const res = await request(
      createApp(freshConfig({ ADMIN_USER_IDS: 'user-aaa-111,user-bbb-222' }))
    ).get('/service/status');
    expect(res.body.adminConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('user-aaa');
  });

  it('serves /service/health through the same handler', async () => {
    const app = createApp(freshConfig());
    const a = await request(app).get('/service/status');
    const b = await request(app).get('/service/health');
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it('is not mounted at the root', async () => {
    const res = await request(createApp(freshConfig())).get('/status');
    expect(res.status).toBe(404);
  });

  it('leaks no configured value', async () => {
    const res = await request(
      createApp(
        freshConfig({
          ENCRYPTION_KEY: 'dmFsLWVuYy12YWwtZW5jLXZhbC1lbmMtdmFsLWVuYyE=',
          GCP_SA_KEY_BASE64: 'sa-secret-value',
          CTP_CLIENT_SECRET: 'client-secret-value',
          STRIPE_SECRET_KEY: 'stripe-secret-value',
        })
      )
    ).get('/service/status');
    for (const v of ['dmFsLWVuYy12YWwtZW5j', 'sa-secret-value', 'client-secret-value', 'stripe-secret-value']) {
      expect(res.text).not.toContain(v);
    }
  });
});
