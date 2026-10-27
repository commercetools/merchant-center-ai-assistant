/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import express, { RequestHandler } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { resetPersistenceForTests } from '../../src/persistence';
import { registerFeedbackBodyParser } from '../../src/utils/feedback-body-parser';
import { freshConfig } from '../helpers/env';
import { authEnv } from '../helpers/mc-app';

const MIB = 1024 * 1024;
const body = (bytes: number) => ({ sessionId: 'nope', pad: 'x'.repeat(bytes) });

beforeEach(() => {
  resetPersistenceForTests();
});
afterAll(() => {
  resetPersistenceForTests();
  resetConfigurationForTests();
});

const authedApp = () => createApp(freshConfig({ MC_AUTH_DISABLED: 'true' }));
const anonymousApp = () => createApp(freshConfig(authEnv()));

describe('raised body limit on /service/feedback/submit', () => {
  it('accepts 9 MiB from an authenticated user (parsed, then 404 for the unknown session)', async () => {
    const res = await request(authedApp())
      .post('/service/feedback/submit')
      .set('x-dev-user-id', 'u1')
      .send(body(9 * MIB));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Session not found');
  }, 30_000);

  it('rejects 12 MiB with 413 and the standard envelope', async () => {
    const res = await request(authedApp())
      .post('/service/feedback/submit')
      .set('x-dev-user-id', 'u1')
      .send(body(12 * MIB));
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ success: false, error: 'entity.too.large' });
  }, 30_000);

  it('answers 401 to an anonymous 9 MiB or 12 MiB body, never 413', async () => {
    const app = anonymousApp();
    for (const size of [9 * MIB, 12 * MIB]) {
      // The server answers before reading the body, so the client may see the socket reset
      // while it is still uploading: both outcomes mean the body was never parsed.
      try {
        const res = await request(app).post('/service/feedback/submit').send(body(size));
        expect(res.status).toBe(401);
      } catch (error) {
        expect(['ECONNRESET', 'EPIPE']).toContain((error as { code?: string }).code);
      }
    }
  }, 30_000);

  it('never runs the parser for an unauthenticated request (spy)', async () => {
    const parser = jest.fn<RequestHandler>((_req, _res, next) => next());
    const deny: RequestHandler = (_req, res) => {
      res.status(401).json({ message: 'no' });
    };
    const app = express();
    registerFeedbackBodyParser(app, deny, '/service', parser);
    app.use(errorMiddleware);
    const res = await request(app).post('/service/feedback/submit').send({ a: 1 });
    expect(res.status).toBe(401);
    expect(parser).not.toHaveBeenCalled();
  });

  it('runs the parser after authentication succeeded (spy)', async () => {
    const parser = jest.fn<RequestHandler>((_req, res) => {
      res.status(204).end();
    });
    const allow: RequestHandler = (_req, _res, next) => next();
    const app = express();
    registerFeedbackBodyParser(app, allow, '/service', parser);
    const res = await request(app).post('/service/feedback/submit').send({ a: 1 });
    expect(res.status).toBe(204);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it('leaves the global limit on other routes (200 KB to /service/session -> 413)', async () => {
    const res = await request(authedApp())
      .post('/service/session')
      .set('x-dev-user-id', 'u1')
      .send({ pad: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('entity.too.large');
  });
});
