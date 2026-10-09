/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import request from 'supertest';
import { resetConfigurationForTests } from '../../../src/config';
import { errorMiddleware } from '../../../src/middleware/error.middleware';
import {
  ConflictError,
  InvalidIdError,
  NotFoundError,
  PersistenceError,
  QueryLimitError,
  SessionTooLongError,
  TooLargeError,
  UnavailableError,
  ValidationError,
} from '../../../src/persistence/gateway/errors';
import { freshConfig } from '../../helpers/env';

const cases: Array<[string, () => Error, number]> = [
  ['NotFoundError', () => new NotFoundError('container ai-assistant-x'), 404],
  ['InvalidIdError', () => new InvalidIdError('id ../x'), 404],
  ['ConflictError', () => new ConflictError('internal detail'), 409],
  ['TooLargeError', () => new TooLargeError('7 MiB in container c'), 413],
  ['SessionTooLongError', () => new SessionTooLongError('s'), 413],
  ['UnavailableError', () => new UnavailableError('host x'), 503],
  ['ValidationError', () => new ValidationError('toolCallLogs verbose'), 400],
  ['QueryLimitError', () => new QueryLimitError('offset'), 400],
];

beforeEach(() => {
  resetConfigurationForTests();
  freshConfig();
});

describe('persistence error mapping', () => {
  it.each(cases)('maps %s', async (_name, make, status) => {
    const app = express();
    app.get('/x', () => {
      throw make();
    });
    app.use(errorMiddleware);
    const res = await request(app).get('/x');
    expect(res.status).toBe(status);
    // fixed generic messages: nothing from the internal message leaks
    expect(res.text).not.toMatch(/container|ai-assistant|MiB|offset|verbose|\.\.\/x|host x/);
  });

  it('leaves a bare PersistenceError as a 500', async () => {
    const app = express();
    app.get('/x', () => {
      throw new PersistenceError('odd');
    });
    app.use(errorMiddleware);
    expect((await request(app).get('/x')).status).toBe(500);
  });
});
