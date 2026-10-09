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
import { useChatServiceConnector } from '../hooks/use-chat-service-connector/use-chat-service-connector';
import type {
  ChatSession,
  GroupedSessionTools,
  SessionSummary,
} from '../hooks/use-chat-service-connector/types';
import { useCurrentUser } from '../hooks/use-current-user';
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
  getSessionDetails: () => Promise<ChatSession | null>;
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

const DEFAULT_SESSION_TITLE = 'New chat';

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
  // Display-only and unverified: sent in the JSON body of session creation so the
  // backoffice can show who a conversation belongs to. It is never an identity: the
  // service identifies the caller from the gateway token. `'anonymous'` is the display
  // fallback of `useCurrentUser`, not a label worth storing.
  const { email } = useCurrentUser();
  const userLabel = email && email !== 'anonymous' ? email : undefined;

  const { isAuthenticated } = useAuth();
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

  // See utils/session-storage.ts.
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

  // Fetch all sessions summary. Resolves with the fresh list (so callers that need the
  // list right now do not read a stale closure) or `null` when the read failed.
  const loadAllSessions = useCallback(async (): Promise<
    SessionSummary[] | null
  > => {
    if (!isAuthenticated) return null;

    try {
      const response = await getAllSessionsSummary();
      if (response.success) {
        setAllSessions(response.data);
        return response.data;
      }
    } catch {
      // The drawer keeps the list it already has; the next refresh retries.
    }
    return null;
  }, [getAllSessionsSummary, isAuthenticated]);

  const getAllSessions = useCallback(async () => {
    await loadAllSessions();
  }, [loadAllSessions]);

  // Function to create a new session
  const createNewSession = useCallback(
    async (title?: string) => {
      try {
        const response = await createSession({
          title: title || sessionTitle || DEFAULT_SESSION_TITLE,
          ...(userLabel ? { userLabel } : {}),
        });

        if (response.success) {
          saveSessionToStorage(response.data.id);
          setSessionId(response.data.id);
          // Refresh the sessions list after creating a new session
          await getAllSessions();
        } else {
          setError('Failed to create chat session');
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create chat session'
        );
      }
    },
    [
      createSession,
      sessionTitle,
      userLabel,
      saveSessionToStorage,
      getAllSessions,
    ]
  );

  // Function to fetch the last session
  // The service answers 404 when the caller has no session yet; any failure is handled
  // the same way: start a new one.
  const fetchLastSession = useCallback(async () => {
    try {
      const response = await getLastSession();
      if (!response.success) {
        throw new Error('Failed to fetch last session');
      }
      setSessionId(response.data.id);
      saveSessionToStorage(response.data.id);
      return response.data.id;
    } catch {
      await createNewSession();
      return undefined;
    }
  }, [getLastSession, createNewSession, saveSessionToStorage]);

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
    if (!isAuthenticated) return;

    const storedSessionId = loadSessionFromStorage();

    if (storedSessionId) {
      setSessionId(storedSessionId);
      return;
    }

    // Nothing stored: this is the only branch that still has to ask the service which
    // session to open, so it is the only one that shows a loading state.
    try {
      setIsLoading(true);
      setError(null);
      await fetchLastSession();
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadSessionFromStorage, fetchLastSession]);

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
      const response = await getSession(sessionId);
      return response.success ? response.data : null;
    } catch {
      return null;
    }
  }, [sessionId, getSession]);

  // Fetch session tools
  const fetchSessionTools = useCallback(async () => {
    if (!sessionId) return;

    try {
      setIsLoadingTools(true);
      const response = await getSessionTools(sessionId);
      if (response.success) {
        setSessionTools(response.data);
      }
    } catch {
      // The tool menu stays as it was; opening it again retries.
    } finally {
      setIsLoadingTools(false);
    }
  }, [sessionId, getSessionTools]);

  // Update session tools - now accepts grouped tools format
  const updateTools = useCallback(
    async (tools: GroupedSessionTools[]) => {
      if (!sessionId) return;

      try {
        setIsLoadingTools(true);
        const response = await updateSessionTools(sessionId, tools);
        if (response.success) {
          setSessionTools(response.data);
        }
      } catch {
        // Not saved: the panel keeps its draft, the stored menu is unchanged.
      } finally {
        setIsLoadingTools(false);
      }
    },
    [sessionId, updateSessionTools]
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
        const response = await deleteSession(sessionIdToDelete);
        if (!response.success) return false;

        // Refresh the sessions list. The next session is picked from THIS list, not from
        // the `allSessions` closure, which still contains the deleted one.
        const refreshed = await loadAllSessions();

        // If we deleted the current session, switch to the most recent one
        if (sessionIdToDelete === sessionId) {
          const remaining = (refreshed ?? allSessions).filter(
            (s) => s.id !== sessionIdToDelete
          );
          if (remaining.length > 0) {
            // The service sorts newest first.
            setCurrentSession(remaining[0].id);
          } else {
            // No sessions left, create a new one
            await createNewSession();
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    [
      deleteSession,
      loadAllSessions,
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
  }, [sessionId, fetchSessionTools]);

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

  // The session list is read once when the app opens. `refreshSessions()` re-reads it
  // after a turn (the digest renames the session a second or two later).
  useEffect(() => {
    if (!isAuthenticated) return;
    getAllSessions();
  }, [isAuthenticated, getAllSessions]);

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
