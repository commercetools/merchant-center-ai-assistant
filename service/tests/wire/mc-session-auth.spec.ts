/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { RequestHandler } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { getContext } from '../../src/context/request-context';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';
import { authEnv, probeApp } from '../helpers/mc-app';
import {
  AUDIENCE_ORIGIN,
  GATEWAY_HEADERS,
  hs256Token,
  ISSUER_EU,
  makeKey,
  SESSION_PATH,
  signToken,
  startJwksServer,
  TestKey,
  unsignedToken,
} from '../helpers/mc-jwt';

const GENERIC = 'Missing or invalid Merchant Center session';

let key: TestKey;
let otherKey: TestKey;
let jwks: { close: () => void };
const handler = jest.fn<RequestHandler>();

beforeAll(async () => {
  key = await makeKey();
  otherKey = await makeKey();
  jwks = startJwksServer(key);
});
afterAll(() => jwks.close());

beforeEach(() => {
  resetConfigurationForTests();
  handler.mockReset();
  handler.mockImplementation((req, res) => {
    res.status(200).json({
      user: (req as unknown as { user: unknown }).user,
      context: getContext()?.user,
    });
  });
});

const app = (extra: NodeJS.ProcessEnv = {}) => {
  freshConfig(authEnv(extra));
  return probeApp(handler);
};

const post = (a: ReturnType<typeof app>, token?: string, headers: Record<string, string> = GATEWAY_HEADERS) => {
  let r = request(a).post('/service/probe').set(headers);
  if (token !== undefined) r = r.set('Authorization', `Bearer ${token}`);
  return r.send({});
};

describe('verifyMcSession with the real verifier', () => {
  it('accepts a valid token and sets req.user and the context', async () => {
    const token = await signToken({
      key,
      aud: `${AUDIENCE_ORIGIN}/service/probe`,
      sub: 'user-7',
      projectKey: 'p',
    });
    const res = await post(app(), token);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ userId: 'user-7', projectKey: 'p', isAdmin: false });
    expect(res.body.context).toEqual(res.body.user);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.vary).toContain('Authorization');
  });

  it('serves the real app route (smoke)', async () => {
    freshConfig(authEnv());
    const token = await signToken({ key, aud: `${AUDIENCE_ORIGIN}${SESSION_PATH}` });
    const res = await request(createApp(freshConfig(authEnv())))
      .post(SESSION_PATH)
      .set(GATEWAY_HEADERS)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe('rejection matrix', () => {
  const PROBE = `${AUDIENCE_ORIGIN}/service/probe`;
  const cases: Array<[string, () => Promise<{ token?: string; headers?: Record<string, string> }>]> = [
    ['missing header', async () => ({})],
    ['malformed token', async () => ({ token: 'abc' })],
    ['alg none', async () => ({ token: unsignedToken() })],
    ['HS256 with a shared secret', async () => ({ token: hs256Token('shared-secret') })],
    ['signed by a different key', async () => ({ token: await signToken({ key: otherKey, aud: PROBE }) })],
    ['issuer of another gateway', async () => ({ token: await signToken({ key, aud: PROBE, iss: ISSUER_EU }) })],
    ['audience for another path', async () => ({ token: await signToken({ key, aud: `${AUDIENCE_ORIGIN}/service/other` }) })],
    ['audience for another origin', async () => ({ token: await signToken({ key, aud: 'https://other.example.test/service/probe' }) })],
    ['expired', async () => ({ token: await signToken({ key, aud: PROBE, expiresIn: Math.floor(Date.now() / 1000) - 120 }) })],
    ['no gateway marker headers', async () => ({ token: await signToken({ key, aud: PROBE }), headers: {} })],
    ['only one marker header', async () => ({ token: await signToken({ key, aud: PROBE }), headers: { 'x-mc-api-cloud-identifier': 'gcp-us' } })],
  ];

  it.each(cases)('401 for %s', async (_name, build) => {
    const { token, headers } = await build();
    const res = await post(app(), token, headers ?? GATEWAY_HEADERS);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(GENERIC);
    expect(handler).not.toHaveBeenCalled();
  });

  it('401 with a different message when MC_AUDIENCE is not configured', async () => {
    freshConfig();
    const token = await signToken({ key, aud: PROBE });
    const res = await post(probeApp(handler), token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Service is not configured for authentication');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not accept a raw token without the Bearer prefix', async () => {
    const token = await signToken({ key, aud: PROBE });
    const res = await request(app())
      .post('/service/probe')
      .set(GATEWAY_HEADERS)
      .set('Authorization', token)
      .send({});
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts a valid token after the rejections (valid row)', async () => {
    const res = await post(app(), await signToken({ key, aud: PROBE }));
    expect(res.status).toBe(200);
  });
});

describe('single-project guard and incomplete sessions', () => {
  const PROBE = `${AUDIENCE_ORIGIN}/service/probe`;

  it('403 for a token of another project, without echoing either key', async () => {
    const token = await signToken({ key, aud: PROBE, projectKey: 'other-project' });
    const res = await post(app({ CTP_PROJECT_KEY: 'my-project' }), token);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('This assistant is not available for the requested project');
    expect(res.text).not.toContain('other-project');
    expect(res.text).not.toContain('my-project');
    expect(handler).not.toHaveBeenCalled();
  });

  it('compares project keys case-sensitively', async () => {
    const token = await signToken({ key, aud: PROBE, projectKey: 'P' });
    const res = await post(app({ CTP_PROJECT_KEY: 'p' }), token);
    expect(res.status).toBe(403);
  });

  it('401 incomplete when the project claim is missing', async () => {
    const token = await signToken({ key, aud: PROBE, projectKey: null });
    const res = await post(app(), token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Merchant Center session is incomplete');
  });

  it('401 incomplete when sub is missing', async () => {
    const token = await signToken({ key, aud: PROBE, sub: null });
    const res = await post(app(), token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Merchant Center session is incomplete');
  });
});

describe('GET /service/status', () => {
  it('reports authConfigured without and with an audience', async () => {
    const without = await request(createApp(freshConfig())).get('/service/status');
    expect(without.body.authConfigured).toBe(false);
    const withAudience = await request(createApp(freshConfig(authEnv()))).get('/service/status');
    expect(withAudience.body.authConfigured).toBe(true);
  });
});
