/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import express from 'express';
import request from 'supertest';
import { getContext } from '../../src/context/request-context';
import { initRequestContext } from '../../src/middleware/context.middleware';

function makeApp() {
  const app = express();
  app.use(initRequestContext);
  app.get('/ctx', async (_req, res) => {
    const before = getContext()?.requestId;
    await new Promise((r) => setTimeout(r, 20));
    const after = getContext()?.requestId;
    res.json({
      before,
      after,
      correlationId: getContext()?.correlationId,
    });
  });
  return app;
}

describe('request context', () => {
  it('honours the x-correlation-id header', async () => {
    const res = await request(makeApp())
      .get('/ctx')
      .set('x-correlation-id', 'abc-123');
    expect(res.body.correlationId).toBe('abc-123');
  });

  it('falls back to the request id', async () => {
    const res = await request(makeApp()).get('/ctx');
    expect(res.body.correlationId).toBe(res.body.before);
  });

  it('truncates a long correlation id to 128 characters', async () => {
    const res = await request(makeApp())
      .get('/ctx')
      .set('x-correlation-id', 'a'.repeat(300));
    expect(res.body.correlationId).toHaveLength(128);
  });

  it('isolates two concurrent requests', async () => {
    const app = makeApp();
    const [a, b] = await Promise.all([
      request(app).get('/ctx').set('x-correlation-id', 'one'),
      request(app).get('/ctx').set('x-correlation-id', 'two'),
    ]);
    expect(a.body.correlationId).toBe('one');
    expect(b.body.correlationId).toBe('two');
    expect(a.body.before).toBe(a.body.after);
    expect(b.body.before).toBe(b.body.after);
    expect(a.body.before).not.toBe(b.body.before);
  });

  it('has no context outside a request', () => {
    expect(getContext()).toBeUndefined();
  });
});
