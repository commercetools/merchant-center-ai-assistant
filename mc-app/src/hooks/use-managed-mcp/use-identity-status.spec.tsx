/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useIdentityStatus } from './use-identity-status';

let mockIdentityUserConnected: boolean | undefined;
const mockFetchStatus = jest.fn();
const mockIdentityConfig = { fetchStatus: mockFetchStatus };

jest.mock('../../contexts/auth', () => ({
  useAuth: () => ({ identityUserConnected: mockIdentityUserConnected }),
}));
jest.mock('./use-identity-mcp-config', () => ({
  useIdentityMcpConfig: () => mockIdentityConfig,
}));

beforeEach(() => {
  mockIdentityUserConnected = undefined;
  mockFetchStatus.mockReset();
});

describe('useIdentityStatus', () => {
  it('is unknown and makes no request while no server is bound', () => {
    const { result } = renderHook(() => useIdentityStatus(false));
    expect(result.current.connected).toBeNull();
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });

  it('uses the bootstrap value without a request', () => {
    mockIdentityUserConnected = true;
    const { result } = renderHook(() => useIdentityStatus(true));
    expect(result.current.connected).toBe(true);
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });

  it('keeps a bootstrap "false" as not connected', () => {
    mockIdentityUserConnected = false;
    const { result } = renderHook(() => useIdentityStatus(true));
    expect(result.current.connected).toBe(false);
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });

  it('reads the status once when the bootstrap did not carry it', async () => {
    mockFetchStatus.mockResolvedValue({ connected: true });
    const { result, rerender } = renderHook(() => useIdentityStatus(true));
    expect(result.current.connected).toBeNull();
    await waitFor(() => expect(result.current.connected).toBe(true));
    rerender();
    expect(mockFetchStatus).toHaveBeenCalledTimes(1);
  });

  it('counts a failed request as not connected', async () => {
    mockFetchStatus.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIdentityStatus(true));
    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(result.current.loading).toBe(false);
  });

  it('recheck asks again only on the fallback path', async () => {
    mockFetchStatus.mockResolvedValue({ connected: false });
    const { result } = renderHook(() => useIdentityStatus(true));
    await waitFor(() => expect(result.current.connected).toBe(false));

    mockFetchStatus.mockResolvedValue({ connected: true });
    await act(async () => {
      await result.current.recheck();
    });
    expect(result.current.connected).toBe(true);
    expect(mockFetchStatus).toHaveBeenCalledTimes(2);
  });

  it('recheck makes no request when the bootstrap carries the value', async () => {
    mockIdentityUserConnected = true;
    const { result } = renderHook(() => useIdentityStatus(true));
    await act(async () => {
      await result.current.recheck();
    });
    expect(mockFetchStatus).not.toHaveBeenCalled();
  });

  it('forgets the fetched value when the server is unbound', async () => {
    mockFetchStatus.mockResolvedValue({ connected: true });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useIdentityStatus(enabled),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.connected).toBe(true));
    rerender({ enabled: false });
    expect(result.current.connected).toBeNull();
  });
});
