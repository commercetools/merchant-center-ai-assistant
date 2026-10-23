/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/auth';
import { useCanManageMcpBinding, useIsAssistantAdmin } from './index';

const mockBootstrapSession = jest.fn();

jest.mock('../use-mc-session', () => ({
  useMcSession: () => ({ bootstrapSession: mockBootstrapSession }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const session = (overrides: Record<string, unknown> = {}) => ({
  projectKey: 'project-a',
  userId: 'user-1',
  identityMcpConfigured: false,
  isAdmin: false,
  ...overrides,
});

describe('useIsAssistantAdmin', () => {
  beforeEach(() => {
    mockBootstrapSession.mockReset();
    window.localStorage.clear();
  });

  it('is true only when the bootstrap succeeded and isAdmin is true', async () => {
    mockBootstrapSession.mockResolvedValue(session({ isAdmin: true }));
    const { result } = renderHook(() => useIsAssistantAdmin(), { wrapper });
    // Fail closed while the bootstrap is still loading.
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false when isAdmin is false', async () => {
    mockBootstrapSession.mockResolvedValue(session({ isAdmin: false }));
    const { result } = renderHook(
      () => ({ admin: useIsAssistantAdmin(), auth: useAuth() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(true));
    expect(result.current.admin).toBe(false);
  });

  it('is false when the service omitted isAdmin', async () => {
    // The hook normalises a missing field to false, see useMcSession.
    mockBootstrapSession.mockResolvedValue(session({ isAdmin: undefined }));
    const { result } = renderHook(
      () => ({ admin: useIsAssistantAdmin(), auth: useAuth() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(true));
    expect(result.current.admin).toBe(false);
  });

  it('is false when the bootstrap failed', async () => {
    mockBootstrapSession.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () => ({ admin: useIsAssistantAdmin(), auth: useAuth() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.auth.error).toBe('boom'));
    expect(result.current.admin).toBe(false);
  });

  it('ignores a forged administrator id in localStorage and the URL', async () => {
    window.localStorage.setItem('userEmail', 'admin@example.invalid');
    window.localStorage.setItem('userId', 'admin-user-id');
    window.history.pushState({}, '', '/?userEmail=admin@example.invalid');
    mockBootstrapSession.mockResolvedValue(
      session({ userId: 'user-2', isAdmin: false })
    );
    const { result } = renderHook(
      () => ({ admin: useIsAssistantAdmin(), auth: useAuth() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(true));
    expect(result.current.admin).toBe(false);
    window.history.pushState({}, '', '/');
  });
});

describe('useAuth', () => {
  it('exposes the caller own userId from the bootstrap', async () => {
    mockBootstrapSession.mockResolvedValue(
      session({ userId: 'user-42', isAdmin: true })
    );
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.userId).toBe('user-42'));
    expect(result.current.projectKey).toBe('project-a');
    expect(result.current.isAdmin).toBe(true);
  });
});

describe('useCanManageMcpBinding', () => {
  beforeEach(() => mockBootstrapSession.mockReset());

  const run = async (overrides: Record<string, unknown>) => {
    mockBootstrapSession.mockResolvedValue(session(overrides));
    const { result } = renderHook(
      () => ({ can: useCanManageMcpBinding(), auth: useAuth() }),
      { wrapper }
    );
    // Fail closed while the bootstrap is still loading.
    expect(result.current.can).toBe(false);
    await waitFor(() => expect(result.current.auth.isAuthenticated).toBe(true));
    return result.current.can;
  };

  it('follows the service decision, not isAdmin', async () => {
    expect(await run({ isAdmin: false, canManageMcpBinding: true })).toBe(true);
    expect(await run({ isAdmin: true, canManageMcpBinding: false })).toBe(
      false
    );
  });

  it('is false when the service omitted the field', async () => {
    expect(await run({ isAdmin: true })).toBe(false);
  });
});
