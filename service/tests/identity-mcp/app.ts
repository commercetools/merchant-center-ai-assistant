/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import bodyParser from 'body-parser';
import express, { Express } from 'express';
import { initRequestContext } from '../../src/middleware/context.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { identityMcpRouter } from '../../src/identity-mcp/routes';
import { setIdentityRuntimeForTests } from '../../src/identity-mcp/runtime';
import { MemoryObjectGateway } from '../../src/persistence/gateway/memory.gateway';
import { createPersistence } from '../../src/persistence';
import { createIdentityStores } from '../../src/identity-mcp/adapters/persistence';
import { freshConfig } from '../helpers/env';
import { AUDIENCE, type Rig } from './helpers';

/** Headers of the dev bypass (`MC_AUTH_DISABLED`): the real middleware chain still runs. */
export const asUser = (
  userId: string,
  admin = false
): Record<string, string> => ({
  'x-dev-user-id': userId,
  'x-dev-admin': String(admin),
});

export interface IdentityApp {
  app: Express;
  rig: Rig;
}

/**
 * The real identity router (real `verifyMcSession` in bypass mode, real `requireAdmin`) over
 * in-memory persistence. `fetchFn` stands in for the network.
 */
export function makeIdentityApp(
  fetchFn: typeof fetch,
  env: NodeJS.ProcessEnv = {}
): IdentityApp {
  const config = freshConfig({
    MC_AUTH_DISABLED: 'true',
    CONNECT_SERVICE_URL: AUDIENCE,
    ...env,
  });
  const mem = new MemoryObjectGateway();
  const persistence = createPersistence(config, { gateway: mem });
  const stores = createIdentityStores(persistence);
  const rig: Rig = { config, persistence, stores, mem };
  setIdentityRuntimeForTests({ config, stores, fetchFn });

  const app = express();
  app.use(initRequestContext);
  app.use(bodyParser.json());
  app.use('/service/managed-mcp-identity', identityMcpRouter);
  app.use(errorMiddleware);
  return { app, rig };
}

export const resetIdentityApp = (): void =>
  setIdentityRuntimeForTests(undefined);
