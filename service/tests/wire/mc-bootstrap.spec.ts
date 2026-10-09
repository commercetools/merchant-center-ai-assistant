/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import {
  registerBootstrapContributor,
  resetBootstrapContributorsForTests,
} from '../../src/auth/bootstrap-registry';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';
import { authEnv } from '../helpers/mc-app';
import {
  AUDIENCE_ORIGIN,
  GATEWAY_HEADERS,
  makeKey,
  SESSION_PATH,
  signToken,
  startJwksServer,
  TestKey,
} from '../helpers/mc-jwt';

let key: TestKey;
let jwks: { close: () => void };

beforeAll(async () => {
  key = await makeKey();
  jwks = startJwksServer(key);
});
afterAll(() => jwks.close());
beforeEach(() => {
  resetConfigurationForTests();
  resetBootstrapContributorsForTests();
});

const bootstrap = async (
  env: NodeJS.ProcessEnv,
  sub: string,
  body: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {}
) => {
  const app = createApp(freshConfig(authEnv(env)));
  const token = await signToken({ key, sub, aud: `${AUDIENCE_ORIGIN}${SESSION_PATH}` });
  return request(app)
    .post(SESSION_PATH)
    .set(GATEWAY_HEADERS)
    .set(extraHeaders)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
};

describe('POST /service/auth/session', () => {
  it('returns exactly the core payload for an admin', async () => {
    const res = await bootstrap({ ADMIN_USER_IDS: 'u-admin-1' }, 'u-admin-1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { projectKey: 'p', userId: 'u-admin-1', isAdmin: true },
    });
  });

  it('isAdmin is false for a non-admin even with a forged header', async () => {
    const res = await bootstrap({ ADMIN_USER_IDS: 'u-admin-1' }, 'u-other', {}, {
      'x-admin-email': 'admin@example.com',
    });
    expect(res.body.data.isAdmin).toBe(false);
  });

  it('shows the own user id when the allowlist is empty', async () => {
    const res = await bootstrap({}, 'u-first');
    expect(res.body.data).toEqual({ projectKey: 'p', userId: 'u-first', isAdmin: false });
  });

  it('does not echo body fields and takes the project from the token', async () => {
    const res = await bootstrap({}, 'u-1', { projectKey: 'x', token: 'secret-body-value' });
    expect(res.body.data.projectKey).toBe('p');
    expect(res.text).not.toContain('secret-body-value');
    expect(res.text).not.toContain(AUDIENCE_ORIGIN);
    expect(res.text).not.toContain('mc-api');
  });

  it('merges contributions and omits those of a failing contributor', async () => {
    registerBootstrapContributor('a', async () => ({ toolCallLogs: 'all' }));
    registerBootstrapContributor('b', async () => {
      throw new Error('boom');
    });
    const res = await bootstrap({}, 'u-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      toolCallLogs: 'all',
      projectKey: 'p',
      userId: 'u-1',
      isAdmin: false,
    });
  });

  it('answers 500 with the legacy envelope on a key collision', async () => {
    registerBootstrapContributor('a', async () => ({ k: 1 }));
    registerBootstrapContributor('b', async () => ({ k: 2 }));
    const res = await bootstrap({}, 'u-1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Failed to establish session' });
  });

  it('401 before any contributor runs when there is no session', async () => {
    const contributor = jest.fn(async () => ({}));
    registerBootstrapContributor('spy', contributor);
    const res = await request(createApp(freshConfig(authEnv())))
      .post(SESSION_PATH)
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Missing or invalid Merchant Center session');
    expect(contributor).not.toHaveBeenCalled();
  });

  it('issues no token and no persistence is touched', async () => {
    const res = await bootstrap({}, 'u-1');
    expect(Object.keys(res.body.data).sort()).toEqual(['isAdmin', 'projectKey', 'userId']);
  });
});
