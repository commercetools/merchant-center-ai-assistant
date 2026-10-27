/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useNextPrompts } from './use-next-prompts';

const mockConnector = { getSessionDigest: jest.fn() };

jest.mock('./use-chat-service-connector/use-chat-service-connector', () => ({
  useChatServiceConnector: () => mockConnector,
}));

const prompts = [{ text: 'Show orders', prompt: 'Show me the latest orders' }];
const ready = { success: true, data: { pending: false, nextPrompts: prompts } };
const pending = { success: true, data: { pending: true } };

// Jest fake timers do not take effect under this preset, so the polling tests run on real
// timers against the hook's own schedule (900, 1800, 2500, 3000 ms) and are kept few.
const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

beforeEach(() => {
  mockConnector.getSessionDigest.mockReset();
});

describe('useNextPrompts: opening a chat', () => {
  it('reads the stored prompts once, immediately', async () => {
    mockConnector.getSessionDigest.mockResolvedValue(ready);
    const { result } = renderHook(() => useNextPrompts('s1', null));
    await waitFor(() => expect(result.current.prompts).toEqual(prompts));
    expect(mockConnector.getSessionDigest).toHaveBeenCalledTimes(1);
    expect(mockConnector.getSessionDigest).toHaveBeenCalledWith('s1', 0);
  });

  it('shows nothing when the stored digest is still pending', async () => {
    mockConnector.getSessionDigest.mockResolvedValue(pending);
    const { result } = renderHook(() => useNextPrompts('s1', null));
    await waitFor(() =>
      expect(mockConnector.getSessionDigest).toHaveBeenCalledTimes(1)
    );
    expect(result.current.prompts).toEqual([]);
  });

  it('shows nothing when the read fails', async () => {
    mockConnector.getSessionDigest.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useNextPrompts('s1', null));
    await waitFor(() =>
      expect(mockConnector.getSessionDigest).toHaveBeenCalledTimes(1)
    );
    expect(result.current.prompts).toEqual([]);
  });

  it('does nothing without a session', async () => {
    renderHook(() => useNextPrompts(null, null));
    await sleep(50);
    expect(mockConnector.getSessionDigest).not.toHaveBeenCalled();
  });

  it('drops the previous chat chips when the session changes', async () => {
    mockConnector.getSessionDigest
      .mockResolvedValueOnce(ready)
      .mockResolvedValue(pending);
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useNextPrompts(id, null),
      { initialProps: { id: 's1' } }
    );
    await waitFor(() => expect(result.current.prompts).toEqual(prompts));

    rerender({ id: 's2' });
    await waitFor(() => expect(result.current.prompts).toEqual([]));
  });
});

describe('useNextPrompts: after a finished turn', () => {
  it('does not ask at once, then polls for a digest newer than the turn', async () => {
    mockConnector.getSessionDigest
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(ready);
    const { result } = renderHook(() => useNextPrompts('s1', 1234));
    expect(mockConnector.getSessionDigest).not.toHaveBeenCalled();

    // First attempt (900 ms) is pending, the second (1800 ms) delivers.
    await waitFor(() => expect(result.current.prompts).toEqual(prompts), {
      timeout: 4000,
    });
    expect(mockConnector.getSessionDigest).toHaveBeenNthCalledWith(
      1,
      's1',
      1234
    );
    expect(mockConnector.getSessionDigest).toHaveBeenCalledTimes(2);
  }, 8000);

  it('survives a failing attempt and tries the next one', async () => {
    mockConnector.getSessionDigest
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(ready);
    const { result } = renderHook(() => useNextPrompts('s1', 1234));
    await waitFor(() => expect(result.current.prompts).toEqual(prompts), {
      timeout: 4000,
    });
  }, 8000);

  it('gives up after four attempts', async () => {
    mockConnector.getSessionDigest.mockResolvedValue(pending);
    const { result } = renderHook(() => useNextPrompts('s1', 1234));
    await waitFor(
      () => expect(mockConnector.getSessionDigest).toHaveBeenCalledTimes(4),
      { timeout: 5000 }
    );
    await sleep(300);
    expect(mockConnector.getSessionDigest).toHaveBeenCalledTimes(4);
    expect(result.current.prompts).toEqual([]);
  }, 10000);

  it('dismiss clears the chips and the queued attempts', async () => {
    mockConnector.getSessionDigest.mockResolvedValue(pending);
    const { result } = renderHook(() => useNextPrompts('s1', 1234));
    act(() => result.current.dismiss());
    await sleep(1100);
    expect(mockConnector.getSessionDigest).not.toHaveBeenCalled();
    expect(result.current.prompts).toEqual([]);
  });

  it('cancels the queued attempts on unmount', async () => {
    mockConnector.getSessionDigest.mockResolvedValue(pending);
    const { unmount } = renderHook(() => useNextPrompts('s1', 1234));
    unmount();
    await sleep(1100);
    expect(mockConnector.getSessionDigest).not.toHaveBeenCalled();
  });
});
