/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  PROBE_CONTAINER,
  PROBE_KEY,
  createLifecycleApiRoot,
  runProbe,
} from '../../src/connector/checks/custom-object-probe';
import { readLifecycleEnv } from '../../src/connector/env';
import { API, customObjectHandlers, lifecycleEnv, tokenHandler } from '../helpers/lifecycle';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const store = new Map<string, { container: string; key: string; value: unknown }>();
const apiRoot = () => createLifecycleApiRoot(readLifecycleEnv(lifecycleEnv()));

describe('runProbe', () => {
  it('probe: create read delete', async () => {
    store.clear();
    const calls: string[] = [];
    server.use(
      tokenHandler,
      http.all(`${API}/*`, ({ request }) => {
        calls.push(`${request.method} ${new URL(request.url).pathname}`);
        return undefined;
      }),
      ...customObjectHandlers(store)
    );
    expect(await runProbe(apiRoot())).toEqual({ ok: true });
    expect(calls).toEqual([
      'POST /p1/custom-objects',
      `GET /p1/custom-objects/${PROBE_CONTAINER}/${PROBE_KEY}`,
      `DELETE /p1/custom-objects/${PROBE_CONTAINER}/${PROBE_KEY}`,
    ]);
    expect(store.size).toBe(0);
  });

  it('probe: delete 404 is fine', async () => {
    server.use(
      tokenHandler,
      http.post(`${API}/p1/custom-objects`, () => HttpResponse.json({ id: 'x', version: 1, container: PROBE_CONTAINER, key: PROBE_KEY, value: {} }, { status: 201 })),
      http.get(`${API}/p1/custom-objects/:container/:key`, () => HttpResponse.json({ id: 'x', version: 1, container: PROBE_CONTAINER, key: PROBE_KEY, value: {} })),
      http.delete(`${API}/p1/custom-objects/:container/:key`, () => HttpResponse.json({ statusCode: 404, message: 'gone' }, { status: 404 }))
    );
    expect(await runProbe(apiRoot())).toEqual({ ok: true });
  });

  it('probe: 403 maps to scope hint', async () => {
    store.clear();
    server.use(tokenHandler, ...customObjectHandlers(store, true));
    const result = await runProbe(apiRoot());
    expect(result).toEqual({
      ok: false,
      reason: 'missing manage_key_value_documents scope on the generated API client',
    });
  });

  it('probe: other failures report the status only', async () => {
    server.use(
      tokenHandler,
      http.post(`${API}/p1/custom-objects`, () => HttpResponse.json({ statusCode: 400, message: 'secret detail' }, { status: 400 }))
    );
    const result = await runProbe(apiRoot());
    expect(result).toEqual({ ok: false, reason: 'custom object probe failed (HTTP 400)' });
  });

  it('probe: twice leaves nothing', async () => {
    store.clear();
    server.use(tokenHandler, ...customObjectHandlers(store));
    expect(await runProbe(apiRoot())).toEqual({ ok: true });
    expect(await runProbe(apiRoot())).toEqual({ ok: true });
    expect([...store.values()].filter((o) => o.container === PROBE_CONTAINER)).toHaveLength(0);
  });
});
