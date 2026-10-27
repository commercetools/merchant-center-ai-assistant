/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/contexts/session.tsx, pruned for the panel: one open session per
// host page (the service scopes the list by the `customView` flag), no tools, no deletion,
// no queued prompts, no user label.

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { useChatServiceConnector } from '../hooks/use-chat-service-connector/use-chat-service-connector';
import type { SessionSummary } from '../hooks/use-chat-service-connector/types';
import {
  clearStoredSessionId,
  readStoredSessionId,
  writeStoredSessionId,
} from '../utils/session-storage';
import { useAuth } from './auth';
import { useFeatureFlags } from './feature-flags-context';

interface SessionContextValue {
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  /** Sessions of this host page, newest first. */
  allSessions: SessionSummary[];
  /** Re-read the session list (the digest renames a session after a turn). */
  refreshSessions: () => Promise<void>;
  createNewSession: () => Promise<void>;
  /** Fall back from a stored id the service no longer knows. */
  resolveStaleSession: (staleSessionId: string) => Promise<void>;
  setCurrentSession: (sessionId: string) => void;
}

const DEFAULT_SESSION_TITLE = 'New chat';

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined
);

interface SessionProviderProps {
  children: ReactNode;
  autoCreateSession?: boolean;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({
  children,
  autoCreateSession = true,
}) => {
  const { isAuthenticated } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const { createSession, getLastSession, getAllSessionsSummary } =
    useChatServiceConnector();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([]);

  // Session ids already recovered from - see `resolveStaleSession`.
  const recoveredIds = useRef<Set<string>>(new Set());

  const getAllSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await getAllSessionsSummary();
      if (response.success) setAllSessions(response.data);
    } catch {
      // The list keeps what it has; the next refresh retries.
    }
  }, [getAllSessionsSummary, isAuthenticated]);

  const createNewSession = useCallback(async () => {
    try {
      // Title only: no label, no e-mail. The `customView` flag in the body is what the
      // service stores on the session (the same flag is also on the request URL).
      const response = await createSession({
        title: DEFAULT_SESSION_TITLE,
        featureFlags,
      });
      if (response.success) {
        writeStoredSessionId(response.data.id);
        setSessionId(response.data.id);
        await getAllSessions();
      } else {
        setError('Failed to create chat session');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create chat session'
      );
    }
  }, [createSession, featureFlags, getAllSessions]);

  // The service answers 404 when this page has no session yet; any failure starts a new one.
  const fetchLastSession = useCallback(async () => {
    try {
      const response = await getLastSession();
      if (!response.success) throw new Error('Failed to fetch last session');
      setSessionId(response.data.id);
      writeStoredSessionId(response.data.id);
    } catch {
      await createNewSession();
    }
  }, [getLastSession, createNewSession]);

  /**
   * Adopt the stored id WITHOUT a round trip; the messages read proves it (a 404 there ends
   * in `resolveStaleSession`). Nothing stored: ask the service for this page's newest.
   */
  const initializeSession = useCallback(async () => {
    if (!isAuthenticated) return;

    const stored = readStoredSessionId();
    if (stored) {
      setSessionId(stored);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await fetchLastSession();
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchLastSession]);

  const resolveStaleSession = useCallback(
    async (staleSessionId: string) => {
      if (recoveredIds.current.has(staleSessionId)) return;
      recoveredIds.current.add(staleSessionId);
      clearStoredSessionId();
      try {
        setIsLoading(true);
        await fetchLastSession();
      } finally {
        setIsLoading(false);
      }
    },
    [fetchLastSession]
  );

  const setCurrentSession = useCallback((newSessionId: string) => {
    setSessionId(newSessionId);
    writeStoredSessionId(newSessionId);
  }, []);

  useEffect(() => {
    if (autoCreateSession && !sessionId && isAuthenticated) {
      void initializeSession();
    }
  }, [autoCreateSession, sessionId, isAuthenticated, initializeSession]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void getAllSessions();
  }, [isAuthenticated, getAllSessions]);

  useEffect(() => {
    if (!isAuthenticated && sessionId) {
      clearStoredSessionId();
      setSessionId(null);
      setError(null);
    }
  }, [isAuthenticated, sessionId]);

  const value: SessionContextValue = useMemo(
    () => ({
      sessionId,
      isLoading,
      error,
      allSessions,
      refreshSessions: getAllSessions,
      createNewSession,
      resolveStaleSession,
      setCurrentSession,
    }),
    [
      sessionId,
      isLoading,
      error,
      allSessions,
      getAllSessions,
      createNewSession,
      resolveStaleSession,
      setCurrentSession,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
