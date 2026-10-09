/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express, { RequestHandler } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import {
  auditAdminAction,
  requireAdmin,
} from '../../src/middleware/require-admin.middleware';
import type { AuthenticatedRequest } from '../../src/types/request.types';
import { captureLogs } from '../helpers/log-capture';
import { freshConfig } from '../helpers/env';
import { authEnv, probeApp } from '../helpers/mc-app';
import {
  AUDIENCE_ORIGIN,
  GATEWAY_HEADERS,
  makeKey,
  signToken,
  startJwksServer,
  TestKey,
} from '../helpers/mc-jwt';

const ADMIN_PATH = '/service/admin-probe';
let key: TestKey;
let jwks: { close: () => void };

beforeAll(async () => {
  key = await makeKey();
  jwks = startJwksServer(key);
});
afterAll(() => jwks.close());
beforeEach(() => resetConfigurationForTests());

const ok: RequestHandler = (_req, res) => {
  res.status(200).json({ done: true });
};

const tokenFor = (sub: string, extraClaims?: Record<string, unknown>) =>
  signToken({ key, sub, aud: `${AUDIENCE_ORIGIN}${ADMIN_PATH}`, extraClaims });

/** A not-yet-sent request (do not await before the last chained call). */
const call = (app: express.Express, token: string) =>
  request(app).post(ADMIN_PATH).set(GATEWAY_HEADERS).set('Authorization', `Bearer ${token}`);

const appWith = (ids: string) => {
  freshConfig(authEnv({ ADMIN_USER_IDS: ids }));
  return probeApp(ok);
};

describe('admin = verified sub in ADMIN_USER_IDS', () => {
  it('lets a listed user through', async () => {
    const res = await call(appWith('u-admin-1,u-admin-2'), await tokenFor('u-admin-2')).send({});
    expect(res.status).toBe(200);
  });

  it('rejects an unlisted user with 403 ADMIN_REQUIRED', async () => {
    const res = await call(appWith('u-admin-1'), await tokenFor('u-other')).send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'ADMIN_REQUIRED',
      message: 'Access denied: administrator access required',
    });
  });

  it.each(['U-ADMIN-1', 'u-admin-1x', 'u-admin'])('rejects the look-alike %s', async (sub) => {
    const res = await call(appWith('u-admin-1'), await tokenFor(sub)).send({});
    expect(res.status).toBe(403);
  });

  it('nobody is admin with an empty list, and status says so', async () => {
    const app = appWith('');
    const res = await call(app, await tokenFor('u-admin-1')).send({});
    expect(res.status).toBe(403);
    const status = await request(createApp(freshConfig(authEnv()))).get('/service/status');
    expect(status.body.adminConfigured).toBe(false);
  });

  it('ignores a forged e-mail, label, header, body and query', async () => {
    const app = appWith('u-admin-1');
    const res = await call(app, await tokenFor('u-other'))
      .query({ userEmail: 'admin@example.com', userId: 'u-admin-1' })
      .set('x-admin-email', 'admin@example.com')
      .set('x-user-id', 'u-admin-1')
      .send({ userLabel: 'admin@example.com', userId: 'u-admin-1' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('does not create an admin from a permissions claim, and sets no permissions', async () => {
    const claim = { 'https://mc-api.us-central1.gcp.commercetools.com/claims/user_permissions': ['ManageProject'] };
    let seen: unknown;
    freshConfig(authEnv({ ADMIN_USER_IDS: 'u-admin-1' }));
    const app = probeApp((req, res) => {
      seen = (req as AuthenticatedRequest).user;
      res.status(200).json({});
    });
    const res = await call(app, await tokenFor('u-other', claim)).send({});
    expect(res.status).toBe(403);
    const probe = await call(app, await tokenFor('u-admin-1', claim)).send({});
    expect(probe.status).toBe(200);
    expect(seen).toEqual({ userId: 'u-admin-1', projectKey: 'p', isAdmin: true });
    expect(seen).not.toHaveProperty('permissions');
  });
});

describe('requireAdmin without verifyMcSession', () => {
  it('responds 401 when there is no user', async () => {
    const app = express();
    app.post('/x', requireAdmin, ok);
    app.use(errorMiddleware);
    freshConfig();
    const res = await request(app).post('/x').send({});
    expect(res.status).toBe(401);
  });
});

describe('auditAdminAction', () => {
  it('logs the user id and route and never an e-mail', () => {
    const logs = captureLogs();
    auditAdminAction(
      { user: { userId: 'u-admin-1', projectKey: 'p', isAdmin: true } } as unknown as AuthenticatedRequest,
      'PUT /service/example',
      'ok'
    );
    logs.stop();
    const line = logs.lines.join('');
    expect(line).toContain('audit.admin_action');
    expect(line).toContain('u-admin-1');
    expect(line).toContain('PUT /service/example');
    expect(line).not.toContain('@');
  });
});
