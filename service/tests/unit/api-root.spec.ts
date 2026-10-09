/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { resetConfigurationForTests } from '../../src/config';
import { getApiRoot, resetApiRootForTests } from '../../src/client/create.client';
import { splitScopes } from '../../src/client/build.client';
import { freshConfig, fullCtpEnv } from '../helpers/env';

const server = setupServer();
let tokenRequests = 0;
let apiRequests = 0;

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  tokenRequests = 0;
  apiRequests = 0;
  resetConfigurationForTests();
  resetApiRootForTests();
  freshConfig({ PERSISTENCE_DRIVER: 'custom-objects', ...fullCtpEnv });
  server.use(
    http.post('https://auth.example.test/oauth/token', () => {
      tokenRequests += 1;
      return HttpResponse.json({
        access_token: 'tok',
        expires_in: 3600,
        scope: 'view_key_value_documents:p',
        token_type: 'Bearer',
      });
    })
  );
});

afterEach(() => server.resetHandlers());

describe('getApiRoot', () => {
  it('returns one instance and requests one token for two calls', async () => {
    server.use(
      http.get('https://api.example.test/p', () => {
        apiRequests += 1;
        return HttpResponse.json({ key: 'p' });
      })
    );
    expect(getApiRoot()).toBe(getApiRoot());
    const a = await getApiRoot().get().execute();
    const b = await getApiRoot().get().execute();
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(apiRequests).toBe(2);
    expect(tokenRequests).toBe(1);
  });

  it('retries a 503', async () => {
    server.use(
      http.get('https://api.example.test/p', () => {
        apiRequests += 1;
        return apiRequests === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ key: 'p' });
      })
    );
    const res = await getApiRoot().get().execute();
    expect(res.statusCode).toBe(200);
    expect(apiRequests).toBe(2);
  });

  it('refuses to build without credentials', () => {
    resetConfigurationForTests();
    resetApiRootForTests();
    freshConfig();
    expect(() => getApiRoot()).toThrow(/credentials are not configured/);
  });
});

describe('splitScopes', () => {
  it('accepts spaces and commas', () => {
    expect(splitScopes('a:p b:p,c:p , d:p')).toEqual(['a:p', 'b:p', 'c:p', 'd:p']);
  });
});
