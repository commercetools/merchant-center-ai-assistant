/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { renderHook } from '@testing-library/react';
import { useAdminConnector } from './use-admin-connector';

const mockForwardToFetch = jest.fn();

jest.mock('../utils/forward-to', () => {
  const actual = jest.requireActual('../utils/forward-to');
  return {
    ...actual,
    forwardToFetch: (...args: unknown[]) => mockForwardToFetch(...args),
    forwardToJson: async (uri: string, init?: RequestInit) => {
      const res = await mockForwardToFetch(uri, init);
      if (!res.ok) {
        throw new actual.ForwardToError(uri, res.status, await res.text());
      }
      return res.json();
    },
  };
});

jest.mock('./use-chat-service-endpoint', () => ({
  useChatServiceEndpoint: () => ({
    chatServiceEndpointUrl: 'https://service.example.invalid/service/',
  }),
}));

const ENDPOINT = 'https://service.example.invalid/service/';

describe('useAdminConnector', () => {
  beforeEach(() => {
    mockForwardToFetch.mockReset();
    mockForwardToFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })
    );
  });

  const lastCall = () => {
    const [uri, init] = mockForwardToFetch.mock.calls[0];
    return { uri: String(uri), init: init as RequestInit };
  };

  it('reads provider status without a body', async () => {
    const { result } = renderHook(() => useAdminConnector());
    await result.current.getMCPProviders();
    const { uri, init } = lastCall();
    expect(uri).toBe(`${ENDPOINT}mcp/providers`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('posts backoffice filters by verified user id with paging in the query', async () => {
    const { result } = renderHook(() => useAdminConnector());
    await result.current.getBackofficeThreads({ userId: 'u-1' }, 20, 40);
    const { uri, init } = lastCall();
    expect(uri).toBe(`${ENDPOINT}backoffice/threads?limit=20&offset=40`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      filters: { userId: 'u-1' },
    });
  });

  it('lists feedback with authorUserId and never an e-mail parameter', async () => {
    const { result } = renderHook(() => useAdminConnector());
    await result.current.getFeedbackEntries(20, 0, 'u-2');
    const { uri } = lastCall();
    expect(uri).toBe(
      `${ENDPOINT}feedback/fetch?limit=20&offset=0&authorUserId=u-2`
    );
    expect(uri).not.toMatch(/userEmail|email/i);
  });

  it('omits authorUserId when there is no filter', async () => {
    const { result } = renderHook(() => useAdminConnector());
    await result.current.getFeedbackEntries();
    expect(lastCall().uri).toBe(`${ENDPOINT}feedback/fetch?limit=20&offset=0`);
  });

  it('puts the system prompt as { systemPrompt } and carries no identity', async () => {
    const { result } = renderHook(() => useAdminConnector());
    await result.current.setSystemPromptConfig('hello');
    const { uri, init } = lastCall();
    expect(uri).toBe(`${ENDPOINT}system-prompt`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ systemPrompt: 'hello' });
  });

  it('surfaces a 403 ADMIN_REQUIRED unchanged as a ForwardToError', async () => {
    mockForwardToFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, code: 'ADMIN_REQUIRED' }), {
        status: 403,
      })
    );
    const { result } = renderHook(() => useAdminConnector());
    await expect(
      result.current.getBackofficeThreadMessages('s1')
    ).rejects.toMatchObject({ status: 403 });
  });
});
