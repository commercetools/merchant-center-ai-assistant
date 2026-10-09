/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { renderHook } from '@testing-library/react';
import { BootstrapError, useMcSession } from './index';

const mockFetch = jest.fn();
let mockEndpoint: string | undefined =
  'https://service.example.invalid/service';

jest.mock('../use-fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('../use-chat-service-endpoint', () => ({
  useChatServiceEndpoint: () => ({ chatServiceEndpointUrl: mockEndpoint }),
}));

const response = (init: {
  ok?: boolean;
  status?: number;
  text?: string;
  json?: unknown;
  jsonThrows?: boolean;
}) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: () => Promise.resolve(init.text ?? ''),
    json: () =>
      init.jsonThrows
        ? Promise.reject(new SyntaxError('bad json'))
        : Promise.resolve(init.json),
  } as unknown as Response);

const bootstrap = async () => {
  const { result } = renderHook(() => useMcSession());
  return result.current.bootstrapSession();
};

const failure = async (): Promise<BootstrapError> => {
  try {
    await bootstrap();
  } catch (error) {
    if (error instanceof BootstrapError) return error;
    throw error;
  }
  throw new Error('bootstrap did not fail');
};

beforeEach(() => {
  mockFetch.mockReset();
  mockEndpoint = 'https://service.example.invalid/service';
});

describe('useMcSession bootstrap', () => {
  it('posts an empty body to /auth/session and maps the answer', async () => {
    mockFetch.mockResolvedValue(
      response({
        json: {
          success: true,
          data: {
            projectKey: 'p1',
            userId: 'u1',
            identityMcpConfigured: true,
            isAdmin: true,
            identityUserConnected: false,
            toolCallLogs: 'tools',
          },
        },
      })
    );

    await expect(bootstrap()).resolves.toEqual({
      projectKey: 'p1',
      userId: 'u1',
      identityMcpConfigured: true,
      isAdmin: true,
      identityUserConnected: false,
      toolCallLogs: 'tools',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://service.example.invalid/service/auth/session',
      { method: 'POST', body: '{}' }
    );
  });

  it('trims a trailing slash of the endpoint and defaults missing flags to false', async () => {
    mockEndpoint = 'https://service.example.invalid/service/';
    mockFetch.mockResolvedValue(
      response({
        json: { success: true, data: { projectKey: 'p1', userId: 'u1' } },
      })
    );

    const session = await bootstrap();
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://service.example.invalid/service/auth/session'
    );
    expect(session.identityMcpConfigured).toBe(false);
    expect(session.isAdmin).toBe(false);
    expect(session.identityUserConnected).toBeUndefined();
  });

  it('counts only a literal true as administrator', async () => {
    mockFetch.mockResolvedValue(
      response({
        json: {
          success: true,
          data: { projectKey: 'p', userId: 'u', isAdmin: 'yes' },
        },
      })
    );
    expect((await bootstrap()).isAdmin).toBe(false);
  });

  it.each([401, 403, 500, 502])(
    'maps HTTP %i to a BootstrapError with that status',
    async (status) => {
      mockFetch.mockResolvedValue(
        response({ ok: false, status, text: 'Missing authentication token' })
      );
      const error = await failure();
      expect(error.status).toBe(status);
      expect(error.message).toContain(`(${status})`);
      expect(error.message).toContain('/auth/session');
      expect(error.message).toContain('Missing authentication token');
    }
  );

  it('survives an error page whose body cannot be read', async () => {
    const res = response({ ok: false, status: 503 });
    res.text = () => Promise.reject(new Error('stream broke'));
    mockFetch.mockResolvedValue(res);
    const error = await failure();
    expect(error.status).toBe(503);
  });

  it('maps a network failure to status null', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await failure();
    expect(error.status).toBeNull();
    expect(error.message).toBe('Failed to fetch');
  });

  it('maps an unreachable service without a message to a readable one', async () => {
    mockFetch.mockRejectedValue('offline');
    const error = await failure();
    expect(error.status).toBeNull();
    expect(error.message).toBe('The service is unreachable');
  });

  it('maps an unparseable success answer to status null', async () => {
    mockFetch.mockResolvedValue(response({ jsonThrows: true }));
    const error = await failure();
    expect(error.status).toBeNull();
    expect(error.message).toBe('The service answered with invalid data');
  });

  it('uses the service error text when success is false', async () => {
    mockFetch.mockResolvedValue(
      response({ json: { success: false, error: 'Project not served' } })
    );
    const error = await failure();
    expect(error.status).toBeNull();
    expect(error.message).toBe('Project not served');
  });

  it('falls back to a generic message when the envelope has no data', async () => {
    mockFetch.mockResolvedValue(response({ json: { success: true } }));
    const error = await failure();
    expect(error.message).toBe('Failed to establish session');
  });

  it('refuses to call anything without a configured endpoint', async () => {
    mockEndpoint = undefined;
    const error = await failure();
    expect(error.status).toBeNull();
    expect(error.message).toBe('chatServiceEndpointUrl is not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
