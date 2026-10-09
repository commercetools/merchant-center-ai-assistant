/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useState, useEffect, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { useChatServiceConnector } from './use-chat-service-connector';
import { useSession } from '../../contexts/session';

export const useChatConnector = () => {
  const { getMessages } = useChatServiceConnector();

  // Use session context for all session management
  const {
    sessionId,
    error: sessionError,
    createNewSession,
    getSessionDetails,
    setCurrentSession,
    resolveStaleSession,
  } = useSession();

  const [messages, setMessages] = useState<UIMessage[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * This read doubles as the validity check for the session id.
   *
   * `SessionProvider` adopts the stored id without asking the service about it, so a 404
   * here is how a stale id surfaces - it hands that back for recovery rather than
   * treating it as a failed read. Any OTHER failure keeps the session: a 500 or a dropped
   * connection says nothing about whether the session exists.
   */
  const loadMessages = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        const response = await getMessages(id);

        if (response.notFound) {
          await resolveStaleSession(id);
          return;
        }

        if (response.success) {
          setMessages(response.data);
          return;
        }

        // MUST settle on something. `messages` starts as `undefined` and the chat shell
        // will not render until it is an array, so leaving it unset on a transient
        // failure is a white screen - better an empty conversation the user can type
        // into than nothing at all.
        setMessages([]);
      } catch {
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    },
    [getMessages, resolveStaleSession]
  );

  const refreshMessages = useCallback(async () => {
    if (sessionId) {
      await loadMessages(sessionId);
    }
  }, [sessionId, loadMessages]);

  const handleResetSession = useCallback(async () => {
    setMessages([]);
    setError(null);
    await createNewSession();
  }, [createNewSession]);

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId);
    }
  }, [sessionId, loadMessages]);

  return {
    sessionId,
    messages,
    error: error || sessionError,
    isLoading,
    refreshMessages,
    createNewSession: handleResetSession,
    getSessionDetails,
    setCurrentSession,
  };
};
