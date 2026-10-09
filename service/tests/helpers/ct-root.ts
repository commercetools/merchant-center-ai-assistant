/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { ClientBuilder } from '@commercetools/ts-client';
import { createApiBuilderFromCtpClient } from '@commercetools/platform-sdk';

export const API_HOST = 'https://api.example.test';
export const PROJECT = 'p';

/** A request builder with a fixed token and NO SDK-level retry, so tests see every request. */
export function testRoot() {
  const client = new ClientBuilder()
    .withProjectKey(PROJECT)
    .withExistingTokenFlow('Bearer test-token', { force: true })
    .withHttpMiddleware({ host: API_HOST, enableRetry: false })
    .build();
  return createApiBuilderFromCtpClient(client).withProjectKey({ projectKey: PROJECT });
}
