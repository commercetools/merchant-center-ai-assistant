/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useMcSession } from '../hooks/use-mc-session';
import type { ToolCallLogsMode } from '../hooks/use-mc-session';
import { BootstrapError } from '../hooks/use-mc-session';

/**
 * Project identity and admin flag, derived from the logged-in Merchant Center session.
 *
 * There is no service credential here. Every service call goes through the Merchant Center
 * gateway (`utils/forward-to.ts`), which vouches for the user and project on each request,
 * so nothing is stored, refreshed or re-minted in the browser. `refresh()` re-runs the
 * bootstrap, for example after binding or connecting.
 */

interface AuthContextValue {
  /** True once the bootstrap has succeeded, i.e. the gateway accepted this session. */
  isAuthenticated: boolean;
  loading: boolean;
  /** Message of the last failed bootstrap. Stays set while a retry is in flight. */
  error: string | null;
  /**
   * HTTP status of the last failed bootstrap, when the gateway or service answered at all;
   * `null` for network failures and `success: false` envelopes. A 401 is a lapsed Merchant
   * Center session, which only a fresh sign-in fixes.
   */
  errorStatus: number | null;
  /** The signed-in user's own Merchant Center user id (display only). */
  userId: string | null;
  projectKey: string | null;
  /** True when the project has an identity-mode managed MCP binding. */
  identityMcpConfigured: boolean;
  /** The service decided this user is an administrator. False until the bootstrap says so. */
  isAdmin: boolean;
  /** Optional: `undefined` when the service did not send it. */
  identityUserConnected?: boolean;
  /** Optional: `undefined` when the service did not send it. */
  toolCallLogs?: ToolCallLogsMode;
  /** Re-run the bootstrap. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { bootstrapSession } = useMcSession();

  const [bootstrapped, setBootstrapped] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [identityMcpConfigured, setIdentityMcpConfigured] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [identityUserConnected, setIdentityUserConnected] = useState<
    boolean | undefined
  >(undefined);
  const [toolCallLogs, setToolCallLogs] = useState<
    ToolCallLogsMode | undefined
  >(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  // Guards against overlapping bootstraps (mount plus an early `refresh()`).
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      try {
        const session = await bootstrapSession();
        setUserId(session.userId);
        setProjectKey(session.projectKey);
        setIdentityMcpConfigured(session.identityMcpConfigured);
        setIsAdmin(session.isAdmin === true);
        setIdentityUserConnected(session.identityUserConnected);
        setToolCallLogs(session.toolCallLogs);
        // Cleared on success rather than up front, so a failed bootstrap stays on screen
        // while "Retry" re-runs it instead of the dialog blinking away and coming back.
        setError(null);
        setErrorStatus(null);
        setBootstrapped(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to establish session'
        );
        setErrorStatus(err instanceof BootstrapError ? err.status : null);
        setBootstrapped(false);
        setIsAdmin(false);
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();

    inFlight.current = run;
    return run;
  }, [bootstrapSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: AuthContextValue = useMemo(
    () => ({
      isAuthenticated: bootstrapped,
      loading,
      error,
      errorStatus,
      userId,
      projectKey,
      identityMcpConfigured,
      isAdmin,
      identityUserConnected,
      toolCallLogs,
      refresh,
    }),
    [
      bootstrapped,
      loading,
      error,
      errorStatus,
      userId,
      projectKey,
      identityMcpConfigured,
      isAdmin,
      identityUserConnected,
      toolCallLogs,
      refresh,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
