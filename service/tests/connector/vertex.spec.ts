/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { checkVertex } from '../../src/connector/checks/vertex';

const TOKEN = 'ya29.SECRET-TOKEN-VALUE';
const ENDPOINT =
  'https://us-central1-aiplatform.googleapis.com/v1/projects/proj-1/locations/us-central1/publishers/google/models/*';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const base = {
  projectId: 'proj-1',
  location: 'us-central1',
  model: 'gemini-test-lite',
  getAccessToken: async () => TOKEN,
};

describe('checkVertex', () => {
  it('vertex: 200 ok', async () => {
    let seen: { auth: string | null; url: string; body: unknown } | undefined;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        seen = { auth: request.headers.get('authorization'), url: request.url, body: await request.json() };
        return HttpResponse.json({ totalTokens: 1 });
      })
    );
    expect(await checkVertex(base)).toEqual({ ok: true });
    expect(seen?.auth).toBe(`Bearer ${TOKEN}`);
    expect(seen?.url).toContain('gemini-test-lite:countTokens');
    expect(JSON.stringify(seen?.body)).toContain('ping');
  });

  it('vertex: 403 hint mentions aiplatform.user', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ error: { message: 'denied' } }, { status: 403 })));
    const result = await checkVertex(base);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.hint).toContain('roles/aiplatform.user');
    }
  });

  it('vertex: 404 names model', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({}, { status: 404 })));
    const result = await checkVertex(base);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.hint).toContain('gemini-test-lite');
      expect(result.hint).toContain('GEMINI_LITE_MODEL_NAME');
    }
  });

  it('vertex: 400 and 401 fail', async () => {
    for (const status of [400, 401]) {
      server.use(http.post(ENDPOINT, () => HttpResponse.json({}, { status })));
      const result = await checkVertex(base);
      expect(result.ok).toBe(false);
    }
  });

  it('vertex: 503 warns only', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({}, { status: 503 })));
    const result = await checkVertex(base);
    expect(result).toEqual({ ok: true, warning: expect.stringContaining('503') });
  });

  it('vertex: timeout warns only', async () => {
    server.use(
      http.post(ENDPOINT, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      })
    );
    const result = await checkVertex({ ...base, timeoutMs: 50 });
    expect(result).toEqual({ ok: true, warning: expect.stringContaining('timeout') });
  });

  it('vertex: a rejected key (4xx while minting the token) fails, a network error warns', async () => {
    const rejected = await checkVertex({
      ...base,
      getAccessToken: async () => {
        throw Object.assign(new Error('invalid_grant'), { response: { status: 400 } });
      },
    });
    expect(rejected.ok).toBe(false);
    const offline = await checkVertex({
      ...base,
      getAccessToken: async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      },
    });
    expect(offline.ok).toBe(true);
  });

  it('vertex: results never contain the token', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({}, { status: 403 })));
    const result = await checkVertex(base);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
