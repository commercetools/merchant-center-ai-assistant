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
import ReauthenticateDialog from '../components/reauthenticate-dialog';
import { useAuth } from './auth';

/**
 * Gate that makes sure the session bootstrap succeeded before rendering the app.
 *
 * 0. Bootstrap failed (most often a lapsed Merchant Center session, seen as a gateway
 *    401 once a tab has been open long enough) -> re-authentication dialog over an
 *    otherwise empty page.
 * 1. Bootstrap succeeded -> children.
 *
 * Change q-mc-app-admin-surfaces extends this file with the identity gates (no managed MCP
 * binding -> binding page; user not connected -> connect gate).
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
  const { loading, error, errorStatus, isAuthenticated, refresh } = useAuth();

  const recheck = useCallback(async () => {
    await refresh();
  }, [refresh]);

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
