/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { LoadingSpinner, Stack, Text } from '@commercetools/nimbus';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { IdentityMcpConnectGate } from '../components/identity-mcp-connect-gate';
import { SessionError } from '../components/session-error';
import { useIdentityMcpConfig } from '../hooks/use-identity-mcp';
import { useAuth } from './auth';
import { deriveGateState } from './gate-state';

/**
 * Gate that waits for the session bootstrap and the per-user identity connection.
 *
 * Read-only on the project's Managed MCP binding: this surface can neither create nor
 * change one, so "no binding" is an instruction to ask an administrator, identical for
 * administrators and everyone else. The decision itself is the pure `deriveGateState`.
 */

interface ConnectContextValue {
  /** Re-run the bootstrap. */
  recheck: () => Promise<void>;
}

const ConnectContext = createContext<ConnectContextValue | undefined>(
  undefined
);

export const ConnectProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const {
    isAuthenticated,
    loading,
    error,
    errorStatus,
    identityMcpConfigured,
    refresh,
  } = useAuth();
  const { fetchStatus } = useIdentityMcpConfig();
  const [identityConnected, setIdentityConnected] = useState<boolean | null>(
    null
  );
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshIdentityStatus = useCallback(async () => {
    if (!isAuthenticated || !identityMcpConfigured) {
      setIdentityConnected(null);
      return;
    }
    try {
      setStatusError(null);
      const status = await fetchStatus();
      setIdentityConnected(status.connected);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : 'Could not read identity status'
      );
      setIdentityConnected(false);
    }
  }, [fetchStatus, isAuthenticated, identityMcpConfigured]);

  useEffect(() => {
    void refreshIdentityStatus();
  }, [refreshIdentityStatus]);

  // Stable: the gate keeps it in a `useEffect` dependency array.
  const handleConnected = useCallback(() => setIdentityConnected(true), []);

  const retry = useCallback(async () => {
    await refresh();
    await refreshIdentityStatus();
  }, [refresh, refreshIdentityStatus]);

  const value: ConnectContextValue = React.useMemo(
    () => ({ recheck: refresh }),
    [refresh]
  );

  const gate = deriveGateState({
    // Auth reports `loading` only for the first bootstrap; a failed one is `error`.
    loading: loading && !error,
    error: error ?? (isAuthenticated ? null : 'Could not establish a session'),
    errorStatus,
    identityMcpConfigured,
    identityConnected,
    statusError,
  });

  switch (gate) {
    case 'loading':
      return (
        <Stack direction="column" gap="800" alignItems="center">
          <LoadingSpinner size="lg" />
        </Stack>
      );
    case 'unauthorized':
    case 'forbidden':
      return <SessionError kind={gate} onRetry={refresh} />;
    case 'error':
      return (
        <SessionError
          kind="error"
          detail={error ?? statusError}
          onRetry={retry}
        />
      );
    case 'no-binding':
      return (
        <Stack direction="column" gap="400" alignItems="center" padding="400">
          <Text>
            This project is not connected to an identity-mode Managed MCP Server
            yet. Ask an administrator to set one up in the AI Assistant
            application.
          </Text>
        </Stack>
      );
    case 'connect':
      return (
        <ConnectContext.Provider value={value}>
          <IdentityMcpConnectGate onConnected={handleConnected} />
        </ConnectContext.Provider>
      );
    case 'ready':
      return (
        <ConnectContext.Provider value={value}>
          {children}
        </ConnectContext.Provider>
      );
  }
};

export const useConnect = () => {
  const context = useContext(ConnectContext);
  if (context === undefined) {
    throw new Error('useConnect must be used within a ConnectProvider');
  }
  return context;
};
