/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import request from 'supertest';
import { asyncHandler, fail, ok, okMessage } from '../../src/utils/api-response';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { freshConfig } from '../helpers/env';

const app = () => {
  freshConfig();
  const a = express();
  a.get('/ok', (_req, res) => void ok(res, { a: 1 }));
  a.get('/created', (_req, res) => void ok(res, { id: 'x' }, 201));
  a.get('/msg', (_req, res) => void okMessage(res, 'done'));
  a.get('/fail', (_req, res) => void fail(res, 404, 'Nope'));
  a.get('/fail-msg', (_req, res) => void fail(res, 400, 'Bad', 'detail'));
  a.get(
    '/throws',
    asyncHandler(async () => {
      throw new Error('boom');
    })
  );
  a.use(errorMiddleware);
  return a;
};

describe('api-response helpers', () => {
  it('ok wraps data', async () => {
    const res = await request(app()).get('/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { a: 1 } });
  });

  it('ok accepts a status', async () => {
    const res = await request(app()).get('/created');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('okMessage has a top-level message and no data', async () => {
    const res = await request(app()).get('/msg');
    expect(res.body).toEqual({ success: true, message: 'done' });
  });

  it('fail has success false and an error', async () => {
    const res = await request(app()).get('/fail');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Nope' });
  });

  it('fail adds a message only when given', async () => {
    const res = await request(app()).get('/fail-msg');
    expect(res.body).toEqual({ success: false, error: 'Bad', message: 'detail' });
  });

  it('asyncHandler forwards a rejection to the error middleware', async () => {
    const res = await request(app()).get('/throws');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
