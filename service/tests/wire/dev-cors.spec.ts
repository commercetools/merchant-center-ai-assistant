/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import request from 'supertest';
import { devCors } from '../../src/middleware/dev-cors.middleware';

const app = express();
app.use(devCors);
app.get('/service/x', (_req, res) => res.json({ ok: true }));

describe('devCors', () => {
  it('answers a localhost preflight with the requested headers', async () => {
    const res = await request(app)
      .options('/service/x')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Headers', 'x-dev-admin,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3001'
    );
    expect(res.headers['access-control-allow-headers']).toBe(
      'x-dev-admin,content-type'
    );
  });

  it('adds the allow-origin header to a localhost request', async () => {
    const res = await request(app)
      .get('/service/x')
      .set('Origin', 'http://127.0.0.1:3001');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:3001'
    );
  });

  it('ignores any other origin', async () => {
    const res = await request(app)
      .get('/service/x')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const lookalike = await request(app)
      .get('/service/x')
      .set('Origin', 'http://localhost.evil.example');
    expect(lookalike.headers['access-control-allow-origin']).toBeUndefined();
  });
});
