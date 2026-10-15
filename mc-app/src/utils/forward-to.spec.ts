/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { forwardToFetch, isDirectServiceUri } from './forward-to';

const setEnv = (env: string) => {
  (window as { app?: unknown }).app = { env };
};

describe('isDirectServiceUri', () => {
  const originalApp = (window as { app?: unknown }).app;
  afterEach(() => {
    (window as { app?: unknown }).app = originalApp;
  });

  it('is true only for an http service in development', () => {
    setEnv('development');
    expect(isDirectServiceUri('http://localhost:8080/service/x')).toBe(true);
    expect(isDirectServiceUri('https://svc.example/service/x')).toBe(false);
  });

  it('is false for an http service outside development', () => {
    setEnv('production');
    expect(isDirectServiceUri('http://localhost:8080/service/x')).toBe(false);
  });
});

describe('forwardToFetch direct path', () => {
  const originalApp = (window as { app?: unknown }).app;
  const originalFetch = global.fetch;
  afterEach(() => {
    (window as { app?: unknown }).app = originalApp;
    global.fetch = originalFetch;
  });

  it('calls the http service itself with the caller headers and a JSON accept default', async () => {
    setEnv('development');
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await forwardToFetch('http://localhost:8080/service/x', {
      method: 'POST',
      headers: { 'x-dev-admin': 'true' },
      body: '{}',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/service/x');
    const headers = new Headers(init.headers);
    expect(headers.get('x-dev-admin')).toBe('true');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.method).toBe('POST');
  });
});
