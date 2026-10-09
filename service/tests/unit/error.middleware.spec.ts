/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import CustomError from '../../src/errors/custom.error';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { freshConfig, fullCtpEnv } from '../helpers/env';
import { captureLogs } from '../helpers/log-capture';
import { fakeKeyBase64 } from '../helpers/gcp';

function makeApp() {
  const app = express();
  app.use(bodyParser.json({ limit: '1kb' }));
  app.get('/custom', () => {
    throw new CustomError(403, 'nope');
  });
  app.get('/boom', () => {
    throw new Error('db password is hunter2');
  });
  app.get('/x/callback', () => {
    throw new Error('callback failed');
  });
  app.post('/echo', (_req, res) => void res.json({ ok: true }));
  app.use(errorMiddleware);
  return app;
}

beforeEach(() => resetConfigurationForTests());

describe('errorMiddleware', () => {
  it('renders a CustomError with its status and no stack', async () => {
    freshConfig();
    const res = await request(makeApp()).get('/custom');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'nope', message: 'nope' });
  });

  it('renders body-parser errors as 413, not 500', async () => {
    freshConfig();
    const res = await request(makeApp())
      .post('/echo')
      .send({ pad: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ success: false, error: 'entity.too.large' });
  });

  it('is opaque for unknown errors in production', async () => {
    freshConfig({
      NODE_ENV: 'production',
      PERSISTENCE_DRIVER: 'custom-objects',
      GCP_SA_KEY_BASE64: fakeKeyBase64(),
      ...fullCtpEnv,
    });
    const res = await request(makeApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: 'Internal server error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('shows the message (spelled correctly) in development', async () => {
    freshConfig({ NODE_ENV: 'development' });
    const res = await request(makeApp()).get('/boom');
    expect(res.body).toEqual({
      success: false,
      error: 'Internal server error',
      message: 'db password is hunter2',
    });
  });

  it('includes the stack of a CustomError only in development', async () => {
    freshConfig({ NODE_ENV: 'development' });
    const res = await request(makeApp()).get('/custom');
    expect(typeof res.body.stack).toBe('string');
  });

  it('logs the URL with the OAuth code redacted', async () => {
    freshConfig();
    const capture = captureLogs();
    await request(makeApp()).get('/x/callback?code=SECRET&state=S&error=denied');
    capture.stop();
    const log = capture.lines.join('\n');
    expect(log).toContain('code=[redacted:6]');
    expect(log).toContain('error=denied');
    expect(log).not.toContain('SECRET');
  });
});
