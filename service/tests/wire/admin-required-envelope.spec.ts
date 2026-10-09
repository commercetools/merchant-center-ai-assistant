/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import request from 'supertest';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { requireAdmin } from '../../src/middleware/require-admin.middleware';
import { ok } from '../../src/utils/api-response';
import { freshConfig } from '../helpers/env';

describe('403 ADMIN_REQUIRED body', () => {
  it('uses the shared failure envelope plus the stable code', async () => {
    freshConfig();
    const app = express();
    app.use((req, _res, next) => {
      Object.assign(req, { user: { userId: 'u', projectKey: 'p', isAdmin: false } });
      next();
    });
    app.get('/admin', requireAdmin);
    app.use(errorMiddleware);
    const res = await request(app).get('/admin');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: 'Access denied: administrator access required',
      code: 'ADMIN_REQUIRED',
      message: 'Access denied: administrator access required',
    });
  });

  it('ok adds sibling members such as pagination', async () => {
    const app = express();
    app.get('/l', (_req, res) => {
      ok(res, [1], 200, { pagination: { total: 1 } });
    });
    const res = await request(app).get('/l');
    expect(res.body).toEqual({ success: true, data: [1], pagination: { total: 1 } });
  });
});
