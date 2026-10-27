/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { resetPersistenceForTests } from '../../src/persistence';
import { freshConfig } from '../helpers/env';
import { authEnv } from '../helpers/mc-app';

/**
 * The feedback and backoffice routes of docs/api.md on the assembled app (real verifyMcSession,
 * development bypass for the identity).
 */
beforeEach(() => resetPersistenceForTests());
afterAll(() => {
  resetPersistenceForTests();
  resetConfigurationForTests();
});

const rows: Array<['get' | 'post', string, boolean]> = [
  ['post', '/service/feedback/submit', false], // 20: member
  ['get', '/service/feedback/fetch', true], // 21: admin
  ['get', '/service/feedback/fetch/abc', true], // 22: admin
  ['get', '/service/backoffice/is-admin', false], // 23: member
  ['post', '/service/backoffice/threads', true], // 24: admin
  ['get', '/service/backoffice/threads/abc', true], // 25: admin
];

describe('routes 20-25', () => {
  it.each(rows)('%s %s is mounted and enforces its auth class (admin=%s)', async (method, path, admin) => {
    const app = createApp(freshConfig({ MC_AUTH_DISABLED: 'true' }));
    const member = await request(app)[method](path).set('x-dev-user-id', 'u1').send({});
    if (admin) {
      expect(member.status).toBe(403);
      expect(member.body.code).toBe('ADMIN_REQUIRED');
      const asAdmin = await request(app)[method](path)
        .set('x-dev-user-id', 'adm')
        .set('x-dev-admin', 'true')
        .send({});
      expect(asAdmin.status).not.toBe(403);
      expect(asAdmin.status).not.toBe(401);
    } else {
      expect([200, 201, 400, 404]).toContain(member.status);
    }
    // A missing route would answer the generic "Path not found."
    expect(JSON.stringify(member.body)).not.toContain('Path not found');
  });

  it.each(rows)('%s %s needs a verified session', async (method, path) => {
    const app = createApp(freshConfig(authEnv()));
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });
});
