/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './session';

// Stable function identities: the provider keys its effects on them.
const mockConnector = {
  createSession: jest.fn(),
  getLastSession: jest.fn(),
  getAllSessionsSummary: jest.fn(),
};
const mockFlags = { featureFlags: { customView: 'encoded-host-url' } };
let mockAuthenticated = true;

jest.mock(
  '../hooks/use-chat-service-connector/use-chat-service-connector',
  () => ({ useChatServiceConnector: () => mockConnector })
);
jest.mock('./auth', () => ({
  useAuth: () => ({ isAuthenticated: mockAuthenticated }),
}));
jest.mock('./feature-flags-context', () => ({
  useFeatureFlags: () => mockFlags,
}));

const STORAGE_KEY = 'chat-session-id';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider autoCreateSession>{children}</SessionProvider>
);

const mount = async () => {
  const view = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(view.result.current.sessionId).not.toBeNull());
  return view;
};

beforeEach(() => {
  localStorage.clear();
  mockAuthenticated = true;
  Object.values(mockConnector).forEach((fn) => fn.mockReset());
  mockConnector.getAllSessionsSummary.mockResolvedValue({
    success: true,
    data: [],
  });
  mockConnector.createSession.mockResolvedValue({
    success: true,
    data: { id: 'created' },
  });
});

describe('panel SessionProvider', () => {
  it('adopts the stored id without asking the service', async () => {
    localStorage.setItem(STORAGE_KEY, 'stored');
    const { result } = await mount();
    expect(result.current.sessionId).toBe('stored');
    expect(mockConnector.getLastSession).not.toHaveBeenCalled();
    expect(mockConnector.createSession).not.toHaveBeenCalled();
  });

  it('opens the newest session of this host page when nothing is stored', async () => {
    mockConnector.getLastSession.mockResolvedValue({
      success: true,
      data: { id: 'newest' },
    });
    const { result } = await mount();
    expect(result.current.sessionId).toBe('newest');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('newest');
  });

  it('creates a session with a title and the customView flag only, no label or e-mail', async () => {
    mockConnector.getLastSession.mockRejectedValue(new Error('404'));
    const { result } = await mount();

    expect(mockConnector.createSession).toHaveBeenCalledTimes(1);
    expect(mockConnector.createSession).toHaveBeenCalledWith({
      title: 'New chat',
      featureFlags: { customView: 'encoded-host-url' },
    });
    expect(result.current.sessionId).toBe('created');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('created');
  });

  it('reports a creation failure through error', async () => {
    mockConnector.getLastSession.mockRejectedValue(new Error('404'));
    mockConnector.createSession.mockResolvedValue({ success: false });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() =>
      expect(result.current.error).toBe('Failed to create chat session')
    );
    expect(result.current.sessionId).toBeNull();
  });

  it('recovers from a stale stored id once and rewrites the stored value', async () => {
    localStorage.setItem(STORAGE_KEY, 'dead');
    mockConnector.getLastSession.mockResolvedValue({
      success: true,
      data: { id: 'newest' },
    });
    const { result } = await mount();

    await act(async () => {
      await result.current.resolveStaleSession('dead');
      await result.current.resolveStaleSession('dead');
    });

    expect(mockConnector.getLastSession).toHaveBeenCalledTimes(1);
    expect(result.current.sessionId).toBe('newest');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('newest');
  });

  it('falls through to a new session when recovery finds none', async () => {
    localStorage.setItem(STORAGE_KEY, 'dead');
    mockConnector.getLastSession.mockRejectedValue(new Error('404'));
    const { result } = await mount();

    await act(async () => {
      await result.current.resolveStaleSession('dead');
    });

    expect(result.current.sessionId).toBe('created');
  });

  it('remembers the session chosen from the list', async () => {
    localStorage.setItem(STORAGE_KEY, 'one');
    const { result } = await mount();
    act(() => result.current.setCurrentSession('two'));
    expect(result.current.sessionId).toBe('two');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('two');
  });

  it('does nothing while the user is not authenticated', async () => {
    mockAuthenticated = false;
    renderHook(() => useSession(), { wrapper });
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(mockConnector.getLastSession).not.toHaveBeenCalled();
    expect(mockConnector.getAllSessionsSummary).not.toHaveBeenCalled();
  });

  it('loads the session list of this host page and re-reads it on refresh', async () => {
    localStorage.setItem(STORAGE_KEY, 'one');
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [{ id: 'one' }],
    });
    const { result } = await mount();
    await waitFor(() => expect(result.current.allSessions).toHaveLength(1));

    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [{ id: 'two' }, { id: 'one' }],
    });
    await act(async () => {
      await result.current.refreshSessions();
    });
    expect(result.current.allSessions).toHaveLength(2);
  });

  it('keeps the list it has when a refresh fails', async () => {
    localStorage.setItem(STORAGE_KEY, 'one');
    mockConnector.getAllSessionsSummary.mockResolvedValue({
      success: true,
      data: [{ id: 'one' }],
    });
    const { result } = await mount();
    await waitFor(() => expect(result.current.allSessions).toHaveLength(1));

    mockConnector.getAllSessionsSummary.mockRejectedValue(new Error('down'));
    await act(async () => {
      await result.current.refreshSessions();
    });
    expect(result.current.allSessions).toHaveLength(1);
  });
});
