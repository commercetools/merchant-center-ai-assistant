/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { identityMcpRouter } from '../../src/identity-mcp/routes';
import { requireAdmin } from '../../src/middleware/require-admin.middleware';
import { verifyMcSession } from '../../src/middleware/mc-session.middleware';
import { freshConfig } from '../helpers/env';

interface Layer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

const table = (): string[] =>
  (identityMcpRouter.stack as unknown as Layer[])
    .filter((l) => l.route)
    .map((l) => {
      const method = Object.keys(l.route!.methods)[0].toUpperCase();
      const names = l.route!.stack.map((s) =>
        s.handle === verifyMcSession
          ? 'verifyMcSession'
          : s.handle === requireAdmin
            ? 'requireAdmin'
            : 'handler'
      );
      return `${method} ${l.route!.path} [${names.join(',')}]`;
    });

describe('identity route table', () => {
  it('has exactly the documented (method, path, middleware) list in order', () => {
    expect(table()).toEqual([
      'GET /callback [handler]',
      'GET / [verifyMcSession,handler]',
      'PUT / [verifyMcSession,requireAdmin,handler]',
      'DELETE / [verifyMcSession,requireAdmin,handler]',
      'GET /status [verifyMcSession,handler]',
      'POST /authorize [verifyMcSession,handler]',
      'POST /verify [verifyMcSession,handler]',
      'DELETE /me [verifyMcSession,handler]',
    ]);
  });

  it('through the real app: /status needs a session, /callback does not', async () => {
    const app = createApp(
      freshConfig({ MC_AUDIENCE: 'https://svc.example.test' })
    );
    const status = await request(app).get(
      '/service/managed-mcp-identity/status'
    );
    expect(status.status).toBe(401);
    const cb = await request(app).get('/service/managed-mcp-identity/callback');
    expect(cb.status).toBe(400);
    expect(cb.text).toContain('Missing OAuth state');
  });
});
