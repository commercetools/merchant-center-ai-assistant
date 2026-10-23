/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { render, screen } from '@testing-library/react';
import { NimbusProvider } from '@commercetools/nimbus';
import { ConnectProvider } from './connect';

type AuthState = {
  loading: boolean;
  error: string | null;
  errorStatus?: number;
  isAuthenticated: boolean;
  identityMcpConfigured: boolean;
  refresh: () => Promise<void>;
};

let mockAuth: AuthState;
let mockCanManageBinding = false;
let mockIdentity: { connected: boolean | null; recheck: () => Promise<void> };
const mockUseIdentityStatus = jest.fn();

jest.mock('./auth', () => ({ useAuth: () => mockAuth }));
jest.mock('../hooks/use-assistant-admin', () => ({
  useCanManageMcpBinding: () => mockCanManageBinding,
}));
jest.mock('../hooks/use-managed-mcp/use-identity-status', () => ({
  useIdentityStatus: (enabled: boolean) => {
    mockUseIdentityStatus(enabled);
    return mockIdentity;
  },
}));
jest.mock('../components/reauthenticate-dialog', () => ({
  __esModule: true,
  default: () => <div>reauthenticate-dialog</div>,
}));
jest.mock('../components/managed-mcp', () => ({
  __esModule: true,
  default: () => <div>managed-mcp-page</div>,
}));
jest.mock('../components/admin-required-notice', () => ({
  __esModule: true,
  default: () => <div>admin-required-notice</div>,
}));
jest.mock('../components/managed-mcp/identity-connect-gate', () => ({
  __esModule: true,
  default: () => <div>identity-connect-gate</div>,
}));

const renderGate = () =>
  render(
    <NimbusProvider>
      <ConnectProvider>
        <div>chat-app</div>
      </ConnectProvider>
    </NimbusProvider>
  );

beforeEach(() => {
  mockCanManageBinding = false;
  mockUseIdentityStatus.mockClear();
  mockAuth = {
    loading: false,
    error: null,
    isAuthenticated: true,
    identityMcpConfigured: true,
    refresh: jest.fn(() => Promise.resolve()),
  };
  mockIdentity = { connected: true, recheck: jest.fn(() => Promise.resolve()) };
});

describe('ConnectProvider gate order', () => {
  it('shows only a spinner while the bootstrap loads', () => {
    mockAuth.loading = true;
    renderGate();
    expect(screen.queryByText('chat-app')).toBeNull();
    expect(screen.queryByText('reauthenticate-dialog')).toBeNull();
  });

  it('puts the re-authentication dialog first when the bootstrap failed', () => {
    mockAuth.error = 'Missing authentication token';
    mockAuth.identityMcpConfigured = false;
    renderGate();
    expect(screen.getByText('reauthenticate-dialog')).toBeTruthy();
    expect(screen.queryByText('managed-mcp-page')).toBeNull();
    expect(screen.queryByText('chat-app')).toBeNull();
  });

  it('treats an unauthenticated user like a failed bootstrap', () => {
    mockAuth.isAuthenticated = false;
    renderGate();
    expect(screen.getByText('reauthenticate-dialog')).toBeTruthy();
  });

  it('shows the binding page to a user who may manage the binding (an administrator, or anyone under MCP_BINDING_OPEN_TO_ALL) when no server is bound', () => {
    mockAuth.identityMcpConfigured = false;
    mockCanManageBinding = true;
    renderGate();
    expect(screen.getByText('managed-mcp-page')).toBeTruthy();
    expect(screen.queryByText('chat-app')).toBeNull();
  });

  it('shows the administrator notice to everyone else when no server is bound', () => {
    mockAuth.identityMcpConfigured = false;
    renderGate();
    expect(screen.getByText('admin-required-notice')).toBeTruthy();
  });

  it('waits on a spinner while the identity status is unknown', () => {
    mockIdentity.connected = null;
    renderGate();
    expect(screen.queryByText('chat-app')).toBeNull();
    expect(screen.queryByText('identity-connect-gate')).toBeNull();
  });

  it('shows the connect gate when the user has not connected their account', () => {
    mockIdentity.connected = false;
    renderGate();
    expect(screen.getByText('identity-connect-gate')).toBeTruthy();
    expect(screen.queryByText('chat-app')).toBeNull();
  });

  it('renders the children only when everything is in place', () => {
    renderGate();
    expect(screen.getByText('chat-app')).toBeTruthy();
  });

  it('asks for the identity status only for an authenticated, bound project', () => {
    renderGate();
    expect(mockUseIdentityStatus).toHaveBeenLastCalledWith(true);

    mockAuth.identityMcpConfigured = false;
    renderGate();
    expect(mockUseIdentityStatus).toHaveBeenLastCalledWith(false);
  });
});
