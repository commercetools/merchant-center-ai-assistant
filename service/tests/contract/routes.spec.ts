/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { freshConfig } from '../helpers/env';

/**
 * The published route table (openspec change G, capability rest-api-contract, rows 1-25 and
 * 28; rows 26 and 27 are matched by prefix). `pendingUntil` rows belong to a change that has
 * not landed yet: they are skipped while absent. Remove the marker in that change's tasks.
 */
type Row = { n: number; method: string; path: string; pendingUntil?: 'H' | 'N' | 'L' };

const TABLE: Row[] = [
  { n: 1, method: 'GET', path: '/service/status' },
  { n: 2, method: 'POST', path: '/service/auth/session' },
  { n: 3, method: 'POST', path: '/service/session' },
  { n: 4, method: 'GET', path: '/service/session' },
  { n: 5, method: 'GET', path: '/service/session/all' },
  { n: 6, method: 'GET', path: '/service/session/:sessionId' },
  { n: 7, method: 'PUT', path: '/service/session/:sessionId' },
  { n: 8, method: 'DELETE', path: '/service/session/:sessionId' },
  { n: 9, method: 'GET', path: '/service/session/:sessionId/messages' },
  { n: 10, method: 'GET', path: '/service/session/:sessionId/digest' },
  { n: 11, method: 'GET', path: '/service/session/:sessionId/tools' },
  { n: 12, method: 'POST', path: '/service/session/:sessionId/tools' },
  { n: 13, method: 'PUT', path: '/service/session/:sessionId/tools' },
  { n: 14, method: 'GET', path: '/service/suggestions' },
  { n: 15, method: 'GET', path: '/service/system-prompt' },
  { n: 16, method: 'PUT', path: '/service/system-prompt' },
  { n: 17, method: 'GET', path: '/service/tool-call-logs' },
  { n: 18, method: 'PUT', path: '/service/tool-call-logs' },
  { n: 19, method: 'POST', path: '/service/ai-chat/:sessionId/message/stream', pendingUntil: 'H' },
  { n: 20, method: 'POST', path: '/service/feedback/submit', pendingUntil: 'N' },
  { n: 21, method: 'GET', path: '/service/feedback/fetch', pendingUntil: 'N' },
  { n: 22, method: 'GET', path: '/service/feedback/fetch/:feedbackId', pendingUntil: 'N' },
  { n: 23, method: 'GET', path: '/service/backoffice/is-admin', pendingUntil: 'N' },
  { n: 24, method: 'POST', path: '/service/backoffice/threads', pendingUntil: 'N' },
  { n: 25, method: 'GET', path: '/service/backoffice/threads/:sessionId', pendingUntil: 'N' },
  { n: 28, method: 'GET', path: '/service/files/:sessionId/:fileName', pendingUntil: 'L' },
];

/** Rows 26 and 27 (changes I and J) are matched by prefix. */
const PREFIXES = ['/service/managed-mcp-identity', '/service/mcp'];

/** Change C's liveness alias of row 1 (not in the published table; see notes). */
const EXTRA_ALLOWED = ['GET /service/health'];

type Layer = {
  name?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
  regexp?: RegExp & { fast_slash?: boolean };
  keys?: unknown[];
};

const mountOf = (layer: Layer): string => {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  if (layer.keys && layer.keys.length > 0) {
    throw new Error('contract test cannot read parameterised mount paths');
  }
  return layer.regexp.source
    .replace('\\/?(?=\\/|$)', '')
    .replace(/^\^/, '')
    .replace(/\\\//g, '/');
};

/** Every `(METHOD path)` under the app, depth first, in registration order. */
export function collectRoutes(app: Express): string[] {
  const out: string[] = [];
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          out.push(`${method.toUpperCase()} ${prefix}${layer.route.path === '/' ? '' : layer.route.path}`);
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountOf(layer));
      }
    }
  };
  const router = (app as unknown as { _router?: { stack: Layer[] } })._router;
  walk(router?.stack ?? [], '');
  return out;
}

/** Routes that are in neither the table nor an allowed prefix. */
export function unlisted(actual: string[]): string[] {
  const known = new Set([...TABLE.map((r) => `${r.method} ${r.path}`), ...EXTRA_ALLOWED]);
  return actual.filter((route) => {
    const path = route.split(' ')[1];
    return !known.has(route) && !PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  });
}

const build = (): Express => createApp(freshConfig({ MC_AUTH_DISABLED: 'true' }));

describe('route table contract', () => {
  const actual = collectRoutes(build());

  it('every published row that has landed is mounted', () => {
    const missing = TABLE.filter((r) => !r.pendingUntil)
      .map((r) => `${r.method} ${r.path}`)
      .filter((route) => !actual.includes(route));
    expect(missing).toEqual([]);
  });

  it('no route outside the table is mounted', () => {
    expect(unlisted(actual)).toEqual([]);
  });

  it('a stray route turns the check red', () => {
    const stray = express();
    stray.get('/service/stray', (_req, res) => void res.end());
    expect(unlisted(collectRoutes(stray))).toEqual(['GET /service/stray']);
  });
});

describe('removed legacy routes', () => {
  it.each(['/service/gecx/config/anything', '/service/mcp-legacy/anything'])(
    '%s answers the standard 404 envelope',
    async (path) => {
      const res = await request(build()).get(path).set('x-dev-user-id', 'u1');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.error).toBe('string');
    }
  );
});

describe('authentication on every G route', () => {
  it.each([
    ['GET', '/service/session/all'],
    ['POST', '/service/session'],
    ['GET', '/service/suggestions'],
    ['GET', '/service/system-prompt'],
    ['PUT', '/service/system-prompt'],
    ['GET', '/service/tool-call-logs'],
    ['PUT', '/service/tool-call-logs'],
    ['GET', '/service/session/x/tools'],
  ])('%s %s without a session answers 401', async (method, path) => {
    const app = createApp(freshConfig({ MC_AUDIENCE: 'https://mc.example.test' }));
    const res = await request(app)[method.toLowerCase() as 'get'](path);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
