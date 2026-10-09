/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { RequestHandler } from 'express';
import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import type { AuthenticatedRequest } from '../../src/types/request.types';
import { freshConfig } from '../helpers/env';
import { probeApp } from '../helpers/mc-app';

beforeEach(() => resetConfigurationForTests());

const echo: RequestHandler = (req, res) => {
  res.status(200).json((req as AuthenticatedRequest).user);
};

const bypassApp = (extra: NodeJS.ProcessEnv = {}) => {
  freshConfig({ MC_AUTH_DISABLED: 'true', CTP_PROJECT_KEY: 'my-project', ...extra });
  return probeApp(echo);
};

describe('development bypass', () => {
  it('builds the identity from the dev headers with the project forced', async () => {
    const res = await request(bypassApp())
      .post('/service/probe')
      .set('x-dev-user-id', 'u1')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'u1', projectKey: 'my-project', isAdmin: false });
  });

  it('defaults to dev-user and ignores query parameters', async () => {
    const res = await request(bypassApp())
      .post('/service/probe?userId=x&projectKey=y&userEmail=z')
      .send({ userId: 'b', projectKey: 'c' });
    expect(res.body).toEqual({ userId: 'dev-user', projectKey: 'my-project', isAdmin: false });
  });

  it('x-dev-admin: true makes the dev user an admin', async () => {
    const res = await request(bypassApp())
      .post('/service/admin-probe')
      .set('x-dev-admin', 'true')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
  });

  it('x-dev-admin is only honoured when it is exactly "true"', async () => {
    const res = await request(bypassApp())
      .post('/service/admin-probe')
      .set('x-dev-admin', 'yes')
      .send({});
    expect(res.status).toBe(403);
  });

  it('ignores x-dev-admin and x-dev-user-id when the bypass is off', async () => {
    freshConfig({ MC_AUDIENCE: 'https://svc.example.test' });
    const res = await request(probeApp(echo))
      .post('/service/admin-probe')
      .set('x-dev-admin', 'true')
      .set('x-dev-user-id', 'u1')
      .send({});
    expect(res.status).toBe(401);
  });

  it('is refused by the configuration in production', () => {
    expect(() =>
      freshConfig({ NODE_ENV: 'production', MC_AUTH_DISABLED: 'true' })
    ).toThrow(/MC_AUTH_DISABLED/);
  });
});
