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
  useMemo,
} from 'react';
import AdminRequiredNotice from '../components/admin-required-notice';
import IdentityConnectGate from '../components/managed-mcp/identity-connect-gate';
import ManagedMcpPage from '../components/managed-mcp';
import ReauthenticateDialog from '../components/reauthenticate-dialog';
import { useIsAssistantAdmin } from '../hooks/use-assistant-admin';
import { useIdentityStatus } from '../hooks/use-managed-mcp/use-identity-status';
import { useAuth } from './auth';

/**
 * Gate that makes sure the session bootstrap succeeded before rendering the app.
 *
 * 0. Bootstrap failed (most often a lapsed Merchant Center session, seen as a gateway
 *    401 once a tab has been open long enough) -> re-authentication dialog over an
 *    otherwise empty page.
 * 1. No identity-mode Managed MCP binding for the project -> the binding page for an
 *    administrator, the "Administrator access required" notice for everyone else.
 * 2. Bound, but this user has not connected their own account -> the connect gate.
 * 3. Otherwise -> children.
 */

interface ConnectContextValue {
  /** Re-run the session bootstrap, e.g. after OAuth or a rebind. */
  recheck: () => Promise<void>;
}

const ConnectContext = createContext<ConnectContextValue | undefined>(
  undefined
);

export const ConnectProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const {
    loading,
    error,
    errorStatus,
    isAuthenticated,
    identityMcpConfigured,
    refresh,
  } = useAuth();
  const isAdmin = useIsAssistantAdmin();
  // Called unconditionally (React rules); it only does work once a server is bound.
  const identity = useIdentityStatus(isAuthenticated && identityMcpConfigured);
  const recheckIdentity = identity.recheck;

  const recheck = useCallback(async () => {
    await refresh();
    await recheckIdentity();
  }, [refresh, recheckIdentity]);

  const value: ConnectContextValue = useMemo(() => ({ recheck }), [recheck]);

  if (loading) {
    return (
      <Stack direction="column" gap="800" alignItems="center">
        <LoadingSpinner size="lg" />
      </Stack>
    );
  }

  if (error || !isAuthenticated) {
    // The dialog is portaled, so this line is what sits behind it - and what is left if
    // the user somehow gets past it (a screen reader, a stale portal).
    return (
      <>
        <Stack direction="column" gap="400" alignItems="center">
          <Text color="neutral.11">
            The AI Assistant is unavailable until your Merchant Center session
            is restored.
          </Text>
        </Stack>
        <ReauthenticateDialog
          error={error}
          status={errorStatus}
          onRetry={refresh}
        />
      </>
    );
  }

  if (!identityMcpConfigured) {
    return isAdmin ? (
      <ManagedMcpPage onConnected={recheck} />
    ) : (
      <AdminRequiredNotice context="managed-mcp" />
    );
  }

  if (identity.connected === null) {
    return (
      <Stack direction="column" gap="800" alignItems="center">
        <LoadingSpinner size="lg" />
      </Stack>
    );
  }

  if (!identity.connected) {
    return <IdentityConnectGate onConnected={recheck} />;
  }

  return (
    <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>
  );
};

export const useConnect = () => {
  const context = useContext(ConnectContext);
  if (context === undefined) {
    throw new Error('useConnect must be used within a ConnectProvider');
  }
  return context;
};
