/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import CustomError from '../../src/errors/custom.error';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { fakeKeyBase64 } from '../helpers/gcp';
import { freshConfig, fullCtpEnv } from '../helpers/env';

const production = () =>
  freshConfig({
    NODE_ENV: 'production',
    PERSISTENCE_DRIVER: 'custom-objects',
    GCP_SA_KEY_BASE64: fakeKeyBase64(),
    ...fullCtpEnv,
  });

describe('the error envelope', () => {
  it('a thrown CustomError has success false and an error, no stack outside development', async () => {
    production();
    const app = express();
    app.get('/x', () => {
      throw new CustomError(403, 'Access denied');
    });
    app.use(errorMiddleware);
    const res = await request(app).get('/x');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Access denied');
    expect(res.body.stack).toBeUndefined();
  });

  it('a body-parser 413 has the envelope', async () => {
    freshConfig();
    const app = express();
    app.use(bodyParser.json({ limit: '1kb' }));
    app.post('/x', (_req, res) => void res.json({}));
    app.use(errorMiddleware);
    const res = await request(app).post('/x').send({ pad: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('an unknown path answers 404 with the envelope', async () => {
    const res = await request(createApp(freshConfig())).get('/service/no/such/path');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: 'Path not found.' });
  });

  it('an unexpected error answers 500 with the envelope and no internals', async () => {
    production();
    const app = express();
    app.get('/x', () => {
      throw new Error('db password is hunter2');
    });
    app.use(errorMiddleware);
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
