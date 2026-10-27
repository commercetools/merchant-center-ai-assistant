/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/contexts/tool-call-logs-config.tsx: read-only here (the setting is
// changed in the AI Assistant application, not in the panel).

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useChatServiceConnector } from '../hooks/use-chat-service-connector/use-chat-service-connector';
import type { ToolCallLogsMode } from '../hooks/use-chat-service-connector/types';
import { useAuth } from './auth';

export interface ToolCallLogsConfigContextType {
  /** Same shape as mc-app's context, so the shared typing indicator reads it unchanged. */
  state: { mode: ToolCallLogsMode; isLoading: boolean };
  showToolCalls: boolean;
  showReasoning: boolean;
}

const ToolCallLogsConfigContext =
  createContext<ToolCallLogsConfigContextType | null>(null);

/**
 * `none` until the first answer: an administrator may have hidden reasoning or tool calls,
 * and rendering them for a moment before the setting arrives would leak what was hidden.
 * The mode comes from the bootstrap when it carries one, otherwise from `GET tool-call-logs`.
 */
export const ToolCallLogsConfigProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const { getToolCallLogsConfig } = useChatServiceConnector();
  const { isAuthenticated, toolCallLogs: bootstrapMode } = useAuth();

  const [mode, setMode] = useState<ToolCallLogsMode>('none');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (bootstrapMode !== undefined) {
      setMode(bootstrapMode);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await getToolCallLogsConfig();
        if (!cancelled && response.success) setMode(response.data.mode);
      } catch {
        // Stay on `none`: hiding is the safe default.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, bootstrapMode, getToolCallLogsConfig]);

  const value = useMemo<ToolCallLogsConfigContextType>(
    () => ({
      state: { mode, isLoading },
      showToolCalls: mode === 'tools' || mode === 'all',
      showReasoning: mode === 'thinking' || mode === 'all',
    }),
    [mode, isLoading]
  );

  return (
    <ToolCallLogsConfigContext.Provider value={value}>
      {children}
    </ToolCallLogsConfigContext.Provider>
  );
};

export const useToolCallLogsConfigContext =
  (): ToolCallLogsConfigContextType => {
    const context = useContext(ToolCallLogsConfigContext);
    if (!context) {
      throw new Error(
        'useToolCallLogsConfigContext must be used within a ToolCallLogsConfigProvider'
      );
    }
    return context;
  };
