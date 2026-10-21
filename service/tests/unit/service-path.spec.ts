/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app';
import { SERVICE_BASE_PATH } from '../../src/constants/service-path';
import { callbackUrl } from '../../src/identity-mcp/keys';
import { freshConfig } from '../helpers/env';

const CONNECT_YAML = join(process.cwd(), '..', 'connect.yaml');
// Connect validates each application in its own build context, where the repo root is absent.
const itInRepo = existsSync(CONNECT_YAML) ? it : it.skip;

describe('SERVICE_BASE_PATH', () => {
  itInRepo('equals the endpoint of the service entry in connect.yaml', () => {
    const yaml = readFileSync(CONNECT_YAML, 'utf8');
    const endpoint = /^\s+endpoint:\s*(\S+)\s*$/m.exec(yaml)?.[1];
    expect(endpoint).toBe(SERVICE_BASE_PATH);
  });

  it('is where the app mounts the router', async () => {
    const app = createApp(freshConfig({ MC_AUTH_DISABLED: 'true' }));
    const res = await request(app).get(`${SERVICE_BASE_PATH}/health`);
    expect(res.status).toBe(200);
  });

  it('prefixes the identity callback url', () => {
    const cfg = freshConfig({ CONNECT_SERVICE_URL: 'https://svc.example.test' });
    expect(callbackUrl(cfg)).toBe(
      `https://svc.example.test${SERVICE_BASE_PATH}/managed-mcp-identity/callback`
    );
  });
});
