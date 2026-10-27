/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express, { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { freshConfig } from '../helpers/env';
import { makePersistence } from '../helpers/persistence';
import {
  createServices,
  resetServicesForTests,
  setServicesForTests,
} from '../../src/services/registry';

/**
 * The published route table (docs/api.md), including the liveness alias, the Nimbus readiness
 * route and the routes that reattach to and stop a running chat turn. The managed MCP identity
 * and MCP provider routes are matched by prefix. Every row must be mounted.
 */
type Row = { n: number; method: string; path: string };

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
  { n: 19, method: 'POST', path: '/service/ai-chat/:sessionId/message/stream' },
  { n: 20, method: 'POST', path: '/service/feedback/submit' },
  { n: 21, method: 'GET', path: '/service/feedback/fetch' },
  { n: 22, method: 'GET', path: '/service/feedback/fetch/:feedbackId' },
  { n: 23, method: 'GET', path: '/service/backoffice/is-admin' },
  { n: 24, method: 'POST', path: '/service/backoffice/threads' },
  { n: 25, method: 'GET', path: '/service/backoffice/threads/:sessionId' },
  { n: 28, method: 'GET', path: '/service/files/:sessionId/:fileName' },
  { n: 29, method: 'GET', path: '/service/health' },
  { n: 30, method: 'GET', path: '/service/status/nimbus' },
  { n: 31, method: 'GET', path: '/service/ai-chat/:sessionId/message/stream' },
  { n: 32, method: 'DELETE', path: '/service/ai-chat/:sessionId/message/stream' },
];

/** The managed MCP identity and MCP provider routes are matched by prefix. */
const PREFIXES = ['/service/managed-mcp-identity', '/service/mcp'];

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
  const known = new Set(TABLE.map((r) => `${r.method} ${r.path}`));
  return actual.filter((route) => {
    const path = route.split(' ')[1];
    return !known.has(route) && !PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  });
}

const build = (): Express => createApp(freshConfig({ MC_AUTH_DISABLED: 'true' }));

describe('route table contract', () => {
  const actual = collectRoutes(build());

  it('every published row is mounted', () => {
    const missing = TABLE.map((r) => `${r.method} ${r.path}`)
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

describe('unknown routes under the service prefix', () => {
  it.each(['/service/unknown/config/anything', '/service/unknown/anything'])(
    '%s answers the standard 404 envelope',
    async (path) => {
      const res = await request(build()).get(path).set('x-dev-user-id', 'u1');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.error).toBe('string');
    }
  );
});

describe('authentication on every session, settings, suggestions, files and chat route', () => {
  it.each([
    ['GET', '/service/session/all'],
    ['POST', '/service/session'],
    ['GET', '/service/suggestions'],
    ['GET', '/service/system-prompt'],
    ['PUT', '/service/system-prompt'],
    ['GET', '/service/tool-call-logs'],
    ['PUT', '/service/tool-call-logs'],
    ['GET', '/service/session/x/tools'],
    ['GET', '/service/files/x/y.png'],
    ['POST', '/service/ai-chat/x/message/stream'],
    ['GET', '/service/ai-chat/x/message/stream'],
    ['DELETE', '/service/ai-chat/x/message/stream'],
  ])('%s %s without a session answers 401', async (method, path) => {
    const app = createApp(freshConfig({ CONNECT_SERVICE_URL: 'https://mc.example.test' }));
    const res = await request(app)[method.toLowerCase() as 'get'](path);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('the stream routes load the session first', () => {
  beforeEach(() => setServicesForTests(createServices(makePersistence().p)));
  afterEach(() => resetServicesForTests());

  it.each(['GET', 'DELETE'])(
    '%s answers 404 for a session that does not exist, so nothing is replayed or stopped for it',
    async (method) => {
      const verb = method.toLowerCase() as 'get';
      const res = await request(build())[verb]('/service/ai-chat/nope/message/stream').set(
        'x-dev-user-id',
        'u1'
      );
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    }
  );
});
