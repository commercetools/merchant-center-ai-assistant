/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { http, HttpResponse } from 'msw';
import { fakeKeyBase64 } from './gcp';

export const API = 'https://api.example.test';
export const AUTH = 'https://auth.example.test';

/** Smallest environment `readLifecycleEnv` accepts. */
export function lifecycleEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    CTP_PROJECT_KEY: 'p1',
    CTP_API_URL: API,
    CTP_AUTH_URL: AUTH,
    CTP_CLIENT_ID: 'cid',
    CTP_CLIENT_SECRET: 'csecret-value',
    CTP_SCOPE: 'view_key_value_documents:p1 manage_key_value_documents:p1',
    GCP_SA_KEY_BASE64: fakeKeyBase64(),
    ...extra,
  };
}

export const tokenHandler = http.post(`${AUTH}/oauth/token`, () =>
  HttpResponse.json({
    access_token: 'tok',
    expires_in: 3600,
    scope: 'manage_key_value_documents:p1',
    token_type: 'Bearer',
  })
);

interface StoredObject {
  container: string;
  key: string;
  value: unknown;
}

/** In-memory Custom Objects API (create-or-update, read, delete, list by container). */
export function customObjectHandlers(store: Map<string, StoredObject>, forbidWrites = false) {
  const id = (container: string, key: string): string => `${container}/${key}`;
  const object = (o: StoredObject) => ({
    id: 'id-1',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  });
  const notFound = () =>
    HttpResponse.json({ statusCode: 404, message: 'not found' }, { status: 404 });
  return [
    http.post(`${API}/p1/custom-objects`, async ({ request }) => {
      if (forbidWrites) {
        return HttpResponse.json({ statusCode: 403, message: 'forbidden' }, { status: 403 });
      }
      const body = (await request.json()) as StoredObject;
      store.set(id(body.container, body.key), body);
      return HttpResponse.json(object(body), { status: 201 });
    }),
    http.get(`${API}/p1/custom-objects/:container/:key`, ({ params }) => {
      const found = store.get(id(String(params.container), String(params.key)));
      return found ? HttpResponse.json(object(found)) : notFound();
    }),
    http.delete(`${API}/p1/custom-objects/:container/:key`, ({ params }) => {
      const key = id(String(params.container), String(params.key));
      const found = store.get(key);
      if (!found) return notFound();
      store.delete(key);
      return HttpResponse.json(object(found));
    }),
    http.get(`${API}/p1/custom-objects/:container`, ({ params }) => {
      const results = [...store.values()]
        .filter((o) => o.container === params.container)
        .map(object);
      return HttpResponse.json({ limit: 1, offset: 0, count: results.length, results });
    }),
  ];
}
