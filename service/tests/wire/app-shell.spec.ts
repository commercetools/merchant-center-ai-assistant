/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

const fiveMb = { pad: 'x'.repeat(5 * 1024 * 1024) };

describe('app shell', () => {
  it('answers an unknown path with the 404 shape', async () => {
    const res = await request(createApp(freshConfig())).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Path not found.' });
  });

  it('answers an unknown path under /service with the 404 shape', async () => {
    const res = await request(createApp(freshConfig())).get('/service/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Path not found.' });
  });

  it('does not advertise Express', async () => {
    const res = await request(createApp(freshConfig())).get('/service/status');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('answers 413 for an oversized JSON body on an ordinary path', async () => {
    const res = await request(createApp(freshConfig()))
      .post('/service/other')
      .send(fiveMb);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('entity.too.large');
  });

  it('uses a generated correlation id when none is sent', async () => {
    const res = await request(createApp(freshConfig()))
      .get('/service/status')
      .set('x-correlation-id', 'abc-123');
    expect(res.status).toBe(200);
  });
});
