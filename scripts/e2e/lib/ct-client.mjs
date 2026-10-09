/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Minimal commercetools Custom Objects client for the E2E helpers (fetch only, no SDK).
// Credentials come from service/.env.local (git-ignored); values are never printed.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/** Loads service/.env.local into process.env when present; returns the needed settings. */
export function readCtpSettings(env = process.env) {
  const file = join(REPO, 'service', '.env.local');
  if (existsSync(file) && typeof process.loadEnvFile === 'function') process.loadEnvFile(file);
  const need = (k) => {
    const v = (env[k] ?? '').trim();
    if (!v) throw new Error(`${k} is not set (service/.env.local, manual step M3)`);
    return v;
  };
  return {
    projectKey: need('CTP_PROJECT_KEY'),
    clientId: need('CTP_CLIENT_ID'),
    clientSecret: need('CTP_CLIENT_SECRET'),
    scope: need('CTP_SCOPE'),
    apiUrl: need('CTP_API_URL').replace(/\/$/, ''),
    authUrl: need('CTP_AUTH_URL').replace(/\/$/, ''),
  };
}

export function createClient(settings = readCtpSettings(), fetchFn = fetch) {
  let token = null;
  const bearer = async () => {
    if (token) return token;
    const basic = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
    const res = await fetchFn(`${settings.authUrl}/oauth/token`, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: settings.scope }),
    });
    if (!res.ok) throw new Error(`token request failed with status ${res.status}`);
    token = (await res.json()).access_token;
    return token;
  };
  const call = async (method, path, body) => {
    const res = await fetchFn(`${settings.apiUrl}/${settings.projectKey}${path}`, {
      method,
      headers: { authorization: `Bearer ${await bearer()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'DELETE') return null;
    if (!res.ok) throw new Error(`${method} ${path.split('?')[0]} failed with status ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
  return {
    /** Keyset pagination over every custom object (offset is capped at 10 000 by the platform). */
    async *all(extraWhere = '') {
      let last = null;
      for (;;) {
        const where = [last ? `id > "${last}"` : '', extraWhere].filter(Boolean).join(' and ');
        const q = new URLSearchParams({ limit: '200', sort: 'id asc', withTotal: 'false' });
        if (where) q.set('where', where);
        const page = await call('GET', `/custom-objects?${q}`);
        for (const o of page.results) yield o;
        if (page.results.length < 200) return;
        last = page.results[page.results.length - 1].id;
      }
    },
    get: (container, key) => call('GET', `/custom-objects/${encodeURIComponent(container)}/${encodeURIComponent(key)}`).catch(() => null),
    put: (container, key, value) => call('POST', '/custom-objects', { container, key, value }),
    remove: (container, key) => call('DELETE', `/custom-objects/${encodeURIComponent(container)}/${encodeURIComponent(key)}`),
  };
}
