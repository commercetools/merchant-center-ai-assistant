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
import { resetPersistenceForTests } from '../../src/persistence';
import {
  CHAT_BODY_LIMIT,
  chatStreamPath,
  registerChatBodyParser,
} from '../../src/utils/chat-body-parser';
import { freshConfig } from '../helpers/env';
import { authEnv } from '../helpers/mc-app';

const MIB = 1024 * 1024;
const PATH = '/service/ai-chat/s1/message/stream';
const body = (bytes: number) => ({
  message: { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(bytes) }] },
});

beforeEach(() => resetPersistenceForTests());
afterAll(() => {
  resetPersistenceForTests();
  resetConfigurationForTests();
});

const authedApp = () => createApp(freshConfig({ MC_AUTH_DISABLED: 'true' }));

describe('JSON body limit of the chat stream route', () => {
  it('is 10 MB and the route path is the mounted one', () => {
    expect(CHAT_BODY_LIMIT).toBe('10mb');
    expect(chatStreamPath()).toBe('/service/ai-chat/:sessionId/message/stream');
  });

  it('accepts a 2 MiB message (above the 100 kb default; parsed, then 404 for the unknown session)', async () => {
    const res = await request(authedApp())
      .post(PATH)
      .set('x-dev-user-id', 'u1')
      .send(body(2 * MIB));
    expect(res.status).toBe(404);
  }, 30_000);

  it('rejects 12 MiB with 413 and the standard envelope', async () => {
    const res = await request(authedApp())
      .post(PATH)
      .set('x-dev-user-id', 'u1')
      .send(body(12 * MIB));
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ success: false, error: 'entity.too.large' });
  }, 30_000);

  it('answers 401 to an anonymous 2 MiB body, never 413', async () => {
    const app = createApp(freshConfig(authEnv()));
    try {
      const res = await request(app).post(PATH).send(body(2 * MIB));
      expect(res.status).toBe(401);
    } catch (error) {
      // The server may answer before the upload ends: a reset also means "not parsed".
      expect(['ECONNRESET', 'EPIPE']).toContain((error as { code?: string }).code);
    }
  }, 30_000);

  it('never runs the parser for an unauthenticated request (spy)', async () => {
    const parser = jest.fn<RequestHandler>((_req, _res, next) => next());
    const deny: RequestHandler = (_req, res) => {
      res.status(401).json({ message: 'no' });
    };
    const app = express();
    registerChatBodyParser(app, deny, '/service', parser);
    const res = await request(app).post(PATH).send({ a: 1 });
    expect(res.status).toBe(401);
    expect(parser).not.toHaveBeenCalled();
  });

  it('keeps the 100 kb global limit on other routes', async () => {
    const res = await request(authedApp())
      .post('/service/session')
      .set('x-dev-user-id', 'u1')
      .send({ pad: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });
});
