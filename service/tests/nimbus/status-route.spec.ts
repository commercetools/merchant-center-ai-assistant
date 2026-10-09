/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { resetConfigurationForTests } from '../../src/config';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import type { NimbusBackend, Readiness } from '../../src/nimbus/backend';
import { setNimbusBackendForTests } from '../../src/nimbus';
import { statusRouter } from '../../src/routes/status.route';
import { useEnv } from '../helpers/use-env';

const app = () => {
  const a = express();
  a.use('/service', statusRouter);
  a.use(errorMiddleware);
  return a;
};

const backendReturning = (readiness: Readiness) => {
  const fn = jest.fn(async () => readiness);
  const backend: NimbusBackend = {
    tools: async () => ({}),
    readiness: fn,
    close: async () => undefined,
  };
  return { backend, readiness: fn };
};

describe('GET /service/status/nimbus', () => {
  beforeEach(() => useEnv());
  afterEach(() => {
    setNimbusBackendForTests(undefined);
    resetConfigurationForTests();
  });

  test('200 with version and tool count when healthy', async () => {
    setNimbusBackendForTests(
      backendReturning({ status: 'ok', nimbusMcp: '3.6.0', tools: 7 }).backend
    );
    const res = await request(app()).get('/service/status/nimbus');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', nimbusMcp: '3.6.0', tools: 7 });
  });

  test('503 when degraded, with the missing tools', async () => {
    setNimbusBackendForTests(
      backendReturning({ status: 'degraded', tools: 6, missing: ['get_tokens'] })
        .backend
    );
    const res = await request(app()).get('/service/status/nimbus');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', missing: ['get_tokens'] });
  });

  test('503 on error', async () => {
    setNimbusBackendForTests(
      backendReturning({ status: 'error', reason: 'spawn failed' }).backend
    );
    expect((await request(app()).get('/service/status/nimbus')).status).toBe(503);
  });

  test('200 when disabled by the kill switch, and nothing is spawned', async () => {
    useEnv({ NIMBUS_MCP_ENABLED: 'false' });
    const res = await request(app()).get('/service/status/nimbus');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'disabled' });
  });

  test('/service/status and /service/health never touch the child', async () => {
    const { backend, readiness } = backendReturning({ status: 'ok' });
    setNimbusBackendForTests(backend);
    expect((await request(app()).get('/service/status')).status).toBe(200);
    expect((await request(app()).get('/service/health')).status).toBe(200);
    expect(readiness).not.toHaveBeenCalled();
  });
});
