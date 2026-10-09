/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Client, ClientBuilder } from '@commercetools/ts-client';
import type { CtpConfig } from '../config';

/** CTP_SCOPE may be space- or comma-separated. */
export function splitScopes(scope: string): string[] {
  return scope.split(/[\s,]+/).filter((s) => s !== '');
}

/**
 * Client-credentials client with retry on 5xx and network errors. Deliberately
 * no concurrent-modification middleware (callers re-read and re-merge on 409)
 * and no logger middleware (its default writes response bodies to stdout).
 */
export function buildClient(cfg: CtpConfig): Client {
  const { clientId, clientSecret, scope, apiUrl, authUrl } = cfg;
  if (!clientId || !clientSecret || !scope || !apiUrl || !authUrl) {
    throw new Error(
      'commercetools client credentials are not configured (CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_SCOPE, CTP_API_URL, CTP_AUTH_URL)'
    );
  }
  return new ClientBuilder()
    .withProjectKey(cfg.projectKey)
    .withClientCredentialsFlow({
      host: authUrl,
      projectKey: cfg.projectKey,
      credentials: { clientId, clientSecret: clientSecret.reveal() },
      scopes: splitScopes(scope),
    })
    .withHttpMiddleware({
      host: apiUrl,
      enableRetry: true,
      retryConfig: {
        maxRetries: 3,
        retryDelay: 200,
        backoff: true,
        maxDelay: 5000,
        retryCodes: [500, 502, 503, 504],
      },
    })
    .build();
}
