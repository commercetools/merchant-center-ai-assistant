/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SessionSummary } from '../hooks/use-chat-service-connector/types';
import { SessionProvider, useSession } from './session';

// Stable function identities: the provider keys its effects on them.
const mockConnector = {
  createSession: jest.fn(),
  getSession: jest.fn(),
  getLastSession: jest.fn(),
  getSessionTools: jest.fn(),
  updateSessionTools: jest.fn(),
  getAllSessionsSummary: jest.fn(),
  deleteSession: jest.fn(),
};

jest.mock(
  '../hooks/use-chat-service-connector/use-chat-service-connector',
  () => ({ useChatServiceConnector: () => mockConnector })
);
jest.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ email: 'anonymous' }),
}));
jest.mock('./auth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

const STORAGE_KEY = 'chat-session-id';

const summary = (id: string): SessionSummary =>
  ({ id, title: id } as unknown as SessionSummary);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider autoCreateSession>{children}</SessionProvider>
);

const mountWith = async (storedId: string | null) => {
  if (storedId) localStorage.setItem(STORAGE_KEY, storedId);
  const view = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.sessionId).not.toBeNull());
  return view;
};

beforeEach(() => {
  localStorage.clear();
  Object.values(mockConnector).forEach((fn) => fn.mockReset());
  mockConnector.getSessionTools.mockResolvedValue({ success: true, data: [] });
  mockConnector.getAllSessionsSummary.mockResolvedValue({
    success: true,
    data: [],
  });
  mockConnector.createSession.mockResolvedValue({
    success: true,
    data: { id: 'created' },
  });
});

describe('SessionProvider stale-session recovery', () => {
  it('adopts the stored id without asking the service', async () => {
    const { result } = await mountWith('stored');
    expect(result.current.sessionId).toBe('stored');
    expect(mockConnector.getSession).not.toHaveBeenCalled();
    expect(mockConnector.getLastSession).not.toHaveBeenCalled();
  });

  it('falls back to the most recent session and rewrites the stored id', async () => {
    mockConnector.getLastSession.mockResolvedValue({
      success: true,
      data: { id: 'latest' },
    });
    const { result } = await mountWith('dead');

    await act(async () => {
      await result.current.resolveStaleSession('dead');
    });

    expect(result.current.sessionId).toBe('latest');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('latest');
    expect(mockConnector.createSession).not.toHaveBeenCalled();
  });

  it('creates a session when there is no last session', async () => {
    mockConnector.getLastSession.mockRejectedValue(new Error('404'));
    const { result } = await mountWith('dead');

    await act(async () => {
      await result.current.resolveStaleSession('dead');
    });

    expect(mockConnector.createSession).toHaveBeenCalledTimes(1);
    expect(result.current.sessionId).toBe('created');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('created');
  });

  it('recovers from the same dead id at most once', async () => {
    mockConnector.getLastSession.mockResolvedValue({
      success: true,
      data: { id: 'latest' },
    });
    const { result } = await mountWith('dead');

    await act(async () => {
      await result.current.resolveStaleSession('dead');
      await result.current.resolveStaleSession('dead');
    });

    expect(mockConnector.getLastSession).toHaveBeenCalledTimes(1);
  });
});

describe('SessionProvider delete', () => {
  const setupWithSessions = async (ids: string[], current: string) => {
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: ids.map(summary),
    });
    return mountWith(current);
  };

  it('switches to the first remaining session of the REFRESHED list when the current one is deleted', async () => {
    const { result } = await setupWithSessions(['a', 'b', 'c'], 'a');
    mockConnector.deleteSession.mockResolvedValue({ success: true });
    // The refreshed list no longer contains the deleted session.
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [summary('b'), summary('c')],
    });

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteSessionById('a');
    });

    expect(deleted).toBe(true);
    expect(result.current.sessionId).toBe('b');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('b');
  });

  it('ignores a stale deleted entry that the refreshed list still carries', async () => {
    const { result } = await setupWithSessions(['a', 'b'], 'a');
    mockConnector.deleteSession.mockResolvedValue({ success: true });
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [summary('a'), summary('b')],
    });

    await act(async () => {
      await result.current.deleteSessionById('a');
    });

    expect(result.current.sessionId).toBe('b');
  });

  it('creates a new session when the last one is deleted', async () => {
    const { result } = await setupWithSessions(['a'], 'a');
    mockConnector.deleteSession.mockResolvedValue({ success: true });
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [],
    });

    await act(async () => {
      await result.current.deleteSessionById('a');
    });

    expect(mockConnector.createSession).toHaveBeenCalledTimes(1);
    expect(result.current.sessionId).toBe('created');
  });

  it('keeps the current session when another one is deleted', async () => {
    const { result } = await setupWithSessions(['a', 'b'], 'a');
    mockConnector.deleteSession.mockResolvedValue({ success: true });
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [summary('a')],
    });

    await act(async () => {
      await result.current.deleteSessionById('b');
    });

    expect(result.current.sessionId).toBe('a');
    expect(mockConnector.createSession).not.toHaveBeenCalled();
  });

  it('reports false and changes nothing when the service refuses', async () => {
    const { result } = await setupWithSessions(['a', 'b'], 'a');
    mockConnector.deleteSession.mockResolvedValue({ success: false });

    let deleted = true;
    await act(async () => {
      deleted = await result.current.deleteSessionById('a');
    });

    expect(deleted).toBe(false);
    expect(result.current.sessionId).toBe('a');
  });
});
