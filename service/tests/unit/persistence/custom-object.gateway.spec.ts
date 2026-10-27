/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { CustomObjectGateway } from '../../../src/persistence/gateway/custom-object.gateway';
import {
  ConflictError,
  InvalidIdError,
  TooLargeError,
  UnavailableError,
} from '../../../src/persistence/gateway/errors';
import { API_HOST, PROJECT, testRoot } from '../../helpers/ct-root';

const server = setupServer();
const base = `${API_HOST}/${PROJECT}/custom-objects`;
const noWait = { sleep: async () => undefined };
const seen: Array<{ method: string; url: URL; body?: unknown }> = [];

const obj = (over: Record<string, unknown> = {}) => ({
  id: 'id-1',
  version: 1,
  container: 'c',
  key: 'k',
  value: { n: 1 },
  createdAt: '2026-01-01T00:00:00.000Z',
  lastModifiedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const gateway = (timeoutMs?: number) =>
  new CustomObjectGateway(testRoot(), noWait, timeoutMs);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  seen.length = 0;
});

describe('CustomObjectGateway', () => {
  it('gets an object by container and key', async () => {
    server.use(
      http.get(`${base}/c/k`, ({ request }) => {
        seen.push({ method: 'GET', url: new URL(request.url) });
        return HttpResponse.json(obj());
      })
    );
    const r = await gateway().get('c', 'k');
    expect(r).toMatchObject({ key: 'k', version: 1, value: { n: 1 } });
    expect(seen).toHaveLength(1);
  });

  it('maps a 404 to null for get and delete', async () => {
    server.use(
      http.get(`${base}/c/k`, () => HttpResponse.json({ statusCode: 404 }, { status: 404 })),
      http.delete(`${base}/c/k`, () => HttpResponse.json({ statusCode: 404 }, { status: 404 }))
    );
    expect(await gateway().get('c', 'k')).toBeNull();
    expect(await gateway().delete('c', 'k')).toBeNull();
  });

  it('posts container, key and value, with a version only when given', async () => {
    server.use(
      http.post(base, async ({ request }) => {
        seen.push({ method: 'POST', url: new URL(request.url), body: await request.json() });
        return HttpResponse.json(obj({ version: 2 }));
      })
    );
    await gateway().put('c', 'k', { n: 1 });
    await gateway().put('c', 'k', { n: 1 }, { ifVersion: 3 });
    expect(seen[0].body).toEqual({ container: 'c', key: 'k', value: { n: 1 } });
    expect(seen[1].body).toEqual({ container: 'c', key: 'k', value: { n: 1 }, version: 3 });
  });

  it('maps 409 to ConflictError carrying currentVersion', async () => {
    server.use(
      http.post(base, () =>
        HttpResponse.json(
          { statusCode: 409, errors: [{ code: 'ConcurrentModification', currentVersion: 7 }] },
          { status: 409 }
        )
      )
    );
    const err = await gateway()
      .put('c', 'k', {}, { ifVersion: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as ConflictError).currentVersion).toBe(7);
  });

  it('passes the version on delete and maps 409', async () => {
    server.use(
      http.delete(`${base}/c/k`, ({ request }) => {
        seen.push({ method: 'DELETE', url: new URL(request.url) });
        return HttpResponse.json(
          { statusCode: 409, errors: [{ code: 'ConcurrentModification', currentVersion: 5 }] },
          { status: 409 }
        );
      })
    );
    await expect(gateway().delete('c', 'k', { ifVersion: 4 })).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(seen[0].url.searchParams.get('version')).toBe('4');
  });

  it('encodes where, var, sort, limit, offset and withTotal', async () => {
    server.use(
      http.get(`${base}/c`, ({ request }) => {
        seen.push({ method: 'GET', url: new URL(request.url) });
        return HttpResponse.json({ limit: 20, offset: 0, count: 1, total: 1, results: [obj()] });
      })
    );
    const r = await gateway().query('c', {
      filters: [
        { kind: 'valueEquals', path: 'userId', value: 'x" or 1=1 or "' },
        { kind: 'keyIn', keys: ['a', 'b'] },
        { kind: 'time', field: 'createdAt', op: '>', iso: '2026-01-01T00:00:00.000Z' },
      ],
      sort: { field: 'lastModifiedAt', dir: 'desc' },
      limit: 50,
      offset: 100,
      withTotal: true,
    });
    expect(r.total).toBe(1);
    const sp = seen[0].url.searchParams;
    expect(sp.getAll('where')).toEqual([
      'value(userId = :v0)',
      'key in :k0',
      'createdAt > "2026-01-01T00:00:00.000Z"',
    ]);
    expect(sp.get('var.v0')).toBe('x" or 1=1 or "');
    expect(sp.getAll('var.k0')).toEqual(['a', 'b']);
    expect(sp.get('sort')).toBe('lastModifiedAt desc');
    expect(sp.get('limit')).toBe('50');
    expect(sp.get('offset')).toBe('100');
    expect(sp.get('withTotal')).toBe('true');
  });

  it('makes no request for an unsafe name', async () => {
    server.use(
      http.all('*', ({ request }) => {
        seen.push({ method: request.method, url: new URL(request.url) });
        return HttpResponse.json(obj());
      })
    );
    const gw = gateway();
    await expect(gw.get('a b', 'k')).rejects.toBeInstanceOf(InvalidIdError);
    await expect(gw.put('c', '../k', {})).rejects.toBeInstanceOf(InvalidIdError);
    await expect(gw.delete('c', 'k/../x')).rejects.toBeInstanceOf(InvalidIdError);
    await expect(gw.query('a:b', { limit: 1 })).rejects.toBeInstanceOf(InvalidIdError);
    expect(seen).toHaveLength(0);
  });

  it('refuses an oversized value before any request', async () => {
    server.use(
      http.all('*', ({ request }) => {
        seen.push({ method: request.method, url: new URL(request.url) });
        return HttpResponse.json(obj());
      })
    );
    const big = { blob: 'x'.repeat(7 * 1024 * 1024) };
    await expect(gateway().put('c', 'k', big)).rejects.toBeInstanceOf(TooLargeError);
    expect(seen).toHaveLength(0);
  });

  it('retries a 503 with Retry-After once and then succeeds (two requests)', async () => {
    let calls = 0;
    server.use(
      http.get(`${base}/c/k`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ statusCode: 503 }, { status: 503, headers: { 'Retry-After': '1' } })
          : HttpResponse.json(obj());
      })
    );
    const r = await gateway().get('c', 'k');
    expect(r?.key).toBe('k');
    expect(calls).toBe(2);
  });

  it('throws UnavailableError after three transient failures', async () => {
    let calls = 0;
    server.use(
      http.get(`${base}/c/k`, () => {
        calls += 1;
        return HttpResponse.json({ statusCode: 502 }, { status: 502 });
      })
    );
    await expect(gateway().get('c', 'k')).rejects.toBeInstanceOf(UnavailableError);
    expect(calls).toBe(3);
  });

  it('treats an empty error body from an infrastructure 503 as transient', async () => {
    let calls = 0;
    server.use(
      http.get(`${base}/c/k`, () => {
        calls += 1;
        return calls === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(obj());
      })
    );
    expect((await gateway().get('c', 'k'))?.key).toBe('k');
    expect(calls).toBe(2);
  });

  it('does not retry a 400 or a 500', async () => {
    let calls = 0;
    server.use(
      http.post(base, () => {
        calls += 1;
        return HttpResponse.json({ statusCode: 500 }, { status: 500 });
      })
    );
    await expect(gateway().put('c', 'k', {})).rejects.toBeDefined();
    expect(calls).toBe(1);
  });

  it('gives up on a request that never answers', async () => {
    server.use(
      http.get(`${base}/c/k`, async () => {
        await new Promise((r) => setTimeout(r, 300));
        return HttpResponse.json(obj());
      })
    );
    await expect(gateway(20).get('c', 'k')).rejects.toBeInstanceOf(UnavailableError);
  });
});
