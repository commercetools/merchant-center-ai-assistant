/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

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
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { useChatServiceConnector } from '../hooks/use-chat-service-connector/use-chat-service-connector';
import {
  GroupedSessionTools,
  SessionSummary,
} from '../hooks/use-chat-service-connector/types';
import { useAuth } from './auth';
import {
  clearStoredSessionId,
  readStoredSessionId,
  writeStoredSessionId,
} from '../utils/session-storage';

interface SessionContextValue {
  sessionId: string | null;
  isLoading: boolean;
  error: string | null;
  sessionTools: GroupedSessionTools[];
  isLoadingTools: boolean;
  allSessions: SessionSummary[];
  /**
   * Re-read the session list. Called after a turn finishes, because the router's digest
   * renames the session a second or two later and the rail badge, the recent list and the
   * conversation header all read from here.
   */
  refreshSessions: () => Promise<void>;
  createNewSession: () => Promise<void>;
  getSessionDetails: () => Promise<any | null>;
  fetchSessionTools: () => Promise<void>;
  /**
   * Recover from a stored session id that no longer exists. Called by the messages read,
   * which is what now detects it - see `initializeSessionFromStorage`.
   */
  resolveStaleSession: (staleSessionId: string) => Promise<void>;
  updateTools: (tools: GroupedSessionTools[]) => Promise<void>;
  setCurrentSession: (sessionId: string) => void;
  deleteSessionById: (sessionIdToDelete: string) => Promise<boolean>;
  /**
   * Hand a prompt to the conversation from somewhere outside it.
   *
   * `useChat` - and so `sendMessage` - lives inside `ChatArea`, which is not an ancestor of
   * the preview, the code view or the render error boundary. All three need to start a turn
   * anyway, so the message travels through here and `ChatArea` picks it up.
   *
   * `autoSend: false` (the default) drops the text into the composer for the user to read
   * and edit before sending, which is what a reported render error wants. `true` sends it
   * straight away, which is what the Send button on the annotation toolbar means.
   *
   * `parts` rides along with the text for a caller that has structured context to attach -
   * the annotation toolbar sends its selectors and component source that way rather than
   * flattening them into prose. Only meaningful with `autoSend`: there is nowhere to put a
   * data part in the composer.
   */
  queuePrompt: (
    text: string,
    options?: { autoSend?: boolean; parts?: QueuedPromptPart[] }
  ) => void;
  /** Consumed by `ChatArea`; see `queuePrompt`. */
  pendingPrompt: PendingPrompt | null;
  clearPendingPrompt: () => void;
}

/**
 * A non-text part to send with a queued prompt.
 *
 * Kept structural rather than importing the SDK's `UIMessagePart` union: this context has no
 * other reason to know about the chat transport, and `ChatArea` is what actually hands it to
 * `sendMessage`.
 */
export type QueuedPromptPart = { type: `data-${string}`; data: unknown };

export type PendingPrompt = {
  text: string;
  autoSend: boolean;
  parts?: QueuedPromptPart[];
  /**
   * Distinguishes two queues of the same text.
   *
   * Without it, annotating the same element twice with the same note - or reporting the
   * same render error after a failed fix - would look like no change at all to the effect
   * in `ChatArea`, and the second one would silently do nothing.
   */
  nonce: number;
};

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined
);

interface SessionProviderProps {
  children: ReactNode;
  autoCreateSession?: boolean;
  sessionTitle?: string;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({
  children,
  autoCreateSession = true,
  sessionTitle,
}) => {
  const { userEmail } = useApplicationContext((context) => {
    return {
      userEmail: context.user?.email || 'anonymous',
    };
  });

  const { isAuthenticated, workspace } = useAuth();
  const {
    createSession,
    getSession,
    getLastSession,
    getSessionTools,
    updateSessionTools,
    getAllSessionsSummary,
    deleteSession,
  } = useChatServiceConnector();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionTools, setSessionTools] = useState<GroupedSessionTools[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [allSessions, setAllSessions] = useState<SessionSummary[]>([]);
  // Prompts queued from outside the conversation - see `queuePrompt` on the context type.
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(
    null
  );

  // Session ids already recovered from - see `resolveStaleSession`.
  const recoveredIds = useRef<Set<string>>(new Set());

  // Shared with the bootstrap, which sends the remembered id so the router can resolve
  // the session server-side - see utils/session-storage.ts.
  const saveSessionToStorage = writeStoredSessionId;
  const loadSessionFromStorage = readStoredSessionId;
  const clearSessionFromStorage = clearStoredSessionId;

  const queuePrompt = useCallback(
    (
      text: string,
      options?: { autoSend?: boolean; parts?: QueuedPromptPart[] }
    ) =>
      setPendingPrompt({
        text,
        autoSend: options?.autoSend ?? false,
        parts: options?.parts,
        nonce: Date.now(),
      }),
    []
  );

  const clearPendingPrompt = useCallback(() => setPendingPrompt(null), []);

  // Fetch all sessions summary - internal method, not exposed
  const getAllSessions = useCallback(async () => {
    if (!isAuthenticated || !userEmail) return;

    try {
      const response = await getAllSessionsSummary(userEmail);
      if (response.success) {
        setAllSessions(response.data);
      }
    } catch (err) {
    }
  }, [getAllSessionsSummary, userEmail, isAuthenticated]);

  // Function to create a new session
  const createNewSession = useCallback(
    async (title?: string) => {
      const response = await createSession(
        {
          title:
            title ||
            sessionTitle ||
            `Chat Session ${new Date().toLocaleString()}`,
          metadata: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        },
        userEmail
      );

      if (response.success) {
        saveSessionToStorage(response.data.id);
        setSessionId(response.data.id);
        // Refresh the sessions list after creating a new session
        await getAllSessions();
      } else {
        setError('Failed to create chat session');
      }
    },
    [
      createSession,
      sessionTitle,
      userEmail,
      saveSessionToStorage,
      getAllSessions,
    ]
  );

  // Function to fetch the last session
  const fetchLastSession = useCallback(async () => {
    try {
      const response = await getLastSession(userEmail);
      if (!response.success) {
        throw new Error('Failed to fetch last session');
      }
      setSessionId(response.data.id);
      saveSessionToStorage(response.data.id);
      return response.data.id;
    } catch (error) {
      createNewSession();
    }
  }, [getLastSession, createNewSession, userEmail]);

  /**
   * Adopt the stored session id WITHOUT a round trip, and let the messages read prove it.
   *
   * This used to `GET /session/:id` purely to check the id was still valid, then throw the
   * response away and fetch the messages - which the router validates all over again, and
   * 404s on exactly the same condition. Two serial round trips where one would do, and the
   * first was on the critical path for first paint: nothing could render until it
   * returned. `useChatConnector` now reports a 404 from the messages read back through
   * {@link resolveStaleSession}, so the happy path (a valid stored id, overwhelmingly the
   * common case) costs zero requests and the messages read starts immediately.
   */
  const initializeSessionFromStorage = useCallback(async () => {
    // Don't initialize session if not authenticated
    if (!isAuthenticated) {
      return;
    }

    // The bootstrap already resolved this: it was sent the remembered id and answered
    // with that session if it still exists, or the most recent one if it does not. So
    // there is nothing to look up and nothing to guess.
    if (workspace) {
      if (workspace.session) {
        setSessionId(workspace.session.id);
        saveSessionToStorage(workspace.session.id);
      } else {
        // The project has no sessions at all - first visit, or they were all deleted.
        await createNewSession();
      }
      return;
    }

    // Older router, or its reads failed: resolve it here the way we used to.
    const storedSessionId = loadSessionFromStorage();

    if (storedSessionId) {
      setSessionId(storedSessionId);
      return;
    }

    // Nothing stored: this is the only branch that still has to ask the router which
    // session to open, so it is the only one that shows a loading state.
    try {
      setIsLoading(true);
      setError(null);
      await fetchLastSession();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to initialize session'
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    isAuthenticated,
    workspace,
    saveSessionToStorage,
    createNewSession,
    loadSessionFromStorage,
    fetchLastSession,
  ]);

  /**
   * The stored id turned out not to exist - fall back to the most recent session.
   *
   * Called by `useChatConnector` when the messages read 404s, which is the deferred half
   * of {@link initializeSessionFromStorage}. Guarded by `recoveredIds` so a session that
   * 404s repeatedly (or a `fetchLastSession` that lands on another dead id) cannot spin:
   * each bad id is recovered from at most once per mount, and `fetchLastSession` falls
   * through to creating a session, which always has readable messages.
   */
  const resolveStaleSession = useCallback(
    async (staleSessionId: string) => {
      if (recoveredIds.current.has(staleSessionId)) return;
      recoveredIds.current.add(staleSessionId);

      clearSessionFromStorage();

      // The dead id deliberately stays on `sessionId` until `fetchLastSession` replaces
      // it. Clearing it first re-opens the `!sessionId` guard on the initialization
      // effect below, which - with storage now empty - would start a SECOND
      // `fetchLastSession` racing this one, and two failures would create two sessions.
      // Nothing renders from the dead id in the meantime: `messages` is still undefined,
      // so the chat shell stays behind its gate either way.
      try {
        setIsLoading(true);
        await fetchLastSession();
      } finally {
        setIsLoading(false);
      }
    },
    [clearSessionFromStorage, fetchLastSession]
  );

  // Get session details
  const getSessionDetails = useCallback(async () => {
    if (!sessionId) return null;

    try {
      const response = await getSession(sessionId, userEmail);
      return response.success ? response.data : null;
    } catch (err) {
      return null;
    }
  }, [sessionId, getSession, userEmail]);

  // Fetch session tools
  const fetchSessionTools = useCallback(async () => {
    if (!sessionId) return;

    try {
      setIsLoadingTools(true);
      const response = await getSessionTools(sessionId, userEmail);
      if (response.success) {
        setSessionTools(response.data);
      }
    } catch (err) {
    } finally {
      setIsLoadingTools(false);
    }
  }, [sessionId, getSessionTools, userEmail]);

  // Update session tools - now accepts grouped tools format
  const updateTools = useCallback(
    async (tools: GroupedSessionTools[]) => {
      if (!sessionId) return;

      try {
        setIsLoadingTools(true);
        const response = await updateSessionTools(sessionId, userEmail, tools);
        if (response.success) {
          setSessionTools(response.data);
        }
      } catch (err) {
      } finally {
        setIsLoadingTools(false);
      }
    },
    [sessionId, updateSessionTools, userEmail]
  );

  // Set current session and save to localStorage
  const setCurrentSession = useCallback(
    (newSessionId: string) => {
      setSessionId(newSessionId);
      saveSessionToStorage(newSessionId);
    },
    [saveSessionToStorage]
  );

  // Delete a session by ID
  const deleteSessionById = useCallback(
    async (sessionIdToDelete: string): Promise<boolean> => {
      try {
        const response = await deleteSession(sessionIdToDelete, userEmail);
        if (response.success) {
          // Refresh the sessions list
          await getAllSessions();

          // If we deleted the current session, switch to the most recent one
          if (sessionIdToDelete === sessionId) {
            // Get updated sessions (excluding the deleted one)
            const updatedSessions = allSessions.filter(
              (s) => s.id !== sessionIdToDelete
            );
            if (updatedSessions.length > 0) {
              // Switch to the most recent session (first in the list)
              setCurrentSession(updatedSessions[0].id);
            } else {
              // No sessions left, create a new one
              await createNewSession();
            }
          }
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    },
    [
      deleteSession,
      userEmail,
      getAllSessions,
      sessionId,
      allSessions,
      setCurrentSession,
      createNewSession,
    ]
  );

  useEffect(() => {
    if (sessionId) {
      fetchSessionTools();
    }
  }, [sessionId, userEmail, fetchSessionTools]);

  // Initialize session on mount or when authentication changes
  // Only initialize if authenticated
  useEffect(() => {
    if (autoCreateSession && !sessionId && isAuthenticated) {
      initializeSessionFromStorage();
    }
  }, [
    autoCreateSession,
    sessionId,
    isAuthenticated,
    initializeSessionFromStorage,
  ]);

  /**
   * The session list comes with the bootstrap; only fetch it when it did not.
   *
   * `refreshSessions()` still re-reads it after a turn (the digest renames the session a
   * second or two later), so this is only about the opening state.
   */
  useEffect(() => {
    if (!isAuthenticated || !userEmail) return;
    if (workspace) {
      setAllSessions(workspace.sessions);
      return;
    }
    getAllSessions();
  }, [isAuthenticated, userEmail, workspace, getAllSessions]);

  // Clear session when user logs out
  useEffect(() => {
    if (!isAuthenticated && sessionId) {
      clearSessionFromStorage();
      setSessionId(null);
      setError(null);
      setSessionTools([]);
    }
  }, [isAuthenticated, sessionId, clearSessionFromStorage]);

  const value: SessionContextValue = useMemo(
    () => ({
      sessionId,
      isLoading,
      error,
      sessionTools,
      isLoadingTools,
      allSessions,
      refreshSessions: getAllSessions,
      createNewSession,
      getSessionDetails,
      fetchSessionTools,
      resolveStaleSession,
      updateTools,
      setCurrentSession,
      deleteSessionById,
      queuePrompt,
      pendingPrompt,
      clearPendingPrompt,
    }),
    [
      sessionId,
      isLoading,
      error,
      sessionTools,
      isLoadingTools,
      allSessions,
      getAllSessions,
      createNewSession,
      getSessionDetails,
      fetchSessionTools,
      resolveStaleSession,
      updateTools,
      setCurrentSession,
      deleteSessionById,
      queuePrompt,
      pendingPrompt,
      clearPendingPrompt,
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
