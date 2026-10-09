/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import app from '../src/app';

describe('status route', () => {
  it('returns ok under /service', async () => {
    const res = await request(app).get('/service/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('is not mounted at the root', async () => {
    const res = await request(app).get('/status');
    expect(res.status).toBe(404);
  });
});
