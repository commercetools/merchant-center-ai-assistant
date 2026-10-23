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
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import { useChatServiceConnector } from '../hooks/use-chat-service-connector/use-chat-service-connector';
import { useAuth } from './auth';
import { ToolCallLogsMode } from '../hooks/use-chat-service-connector/types';

/**
 * Tool Call Logs configuration state
 */
export interface ToolCallLogsConfigState {
  mode: ToolCallLogsMode;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasChanges: boolean;
}

/**
 * Context value type
 */
export interface ToolCallLogsConfigContextType {
  // State
  state: ToolCallLogsConfigState;

  // Methods
  loadConfig: () => Promise<void>;
  setMode: (mode: ToolCallLogsMode) => void;
  saveConfig: () => Promise<boolean>;

  // Computed values for rendering
  showToolCalls: boolean;
  showReasoning: boolean;
}

// `none` until the first answer: an administrator may have hidden reasoning or tool calls,
// and rendering them for a moment before the setting arrives would leak what was hidden.
const defaultState: ToolCallLogsConfigState = {
  mode: 'none',
  isLoading: true,
  isSaving: false,
  error: null,
  hasChanges: false,
};

const ToolCallLogsConfigContext =
  createContext<ToolCallLogsConfigContextType | null>(null);

interface ToolCallLogsConfigProviderProps {
  children: ReactNode;
}

/**
 * Provider component for Tool Call Logs configuration
 */
export const ToolCallLogsConfigProvider: React.FC<
  ToolCallLogsConfigProviderProps
> = ({ children }) => {
  const { getToolCallLogsConfig, setToolCallLogsConfig } =
    useChatServiceConnector();
  const { isAuthenticated, toolCallLogs: bootstrapMode } = useAuth();

  const [state, setState] = useState<ToolCallLogsConfigState>(defaultState);
  const [originalMode, setOriginalMode] = useState<ToolCallLogsMode>('none');

  /**
   * Load configuration from server
   */
  const loadConfig = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await getToolCallLogsConfig();

      if (response.success) {
        const mode = response.data.mode;
        setState((prev) => ({
          ...prev,
          mode,
          isLoading: false,
          hasChanges: false,
        }));
        setOriginalMode(mode);
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load Tool Call Logs configuration',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load config',
      }));
    }
  }, [getToolCallLogsConfig]);

  /**
   * Set the mode
   */
  const setMode = useCallback(
    (mode: ToolCallLogsMode) => {
      setState((prev) => ({
        ...prev,
        mode,
        hasChanges: mode !== originalMode,
      }));
    },
    [originalMode]
  );

  /**
   * Save configuration
   */
  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!state.hasChanges) return true;

    setState((prev) => ({ ...prev, isSaving: true, error: null }));

    try {
      const response = await setToolCallLogsConfig(state.mode);

      if (response.success) {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          hasChanges: false,
        }));
        setOriginalMode(state.mode);
        return true;
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: err instanceof Error ? err.message : 'Failed to save',
      }));
      return false;
    }
  }, [state.mode, state.hasChanges, setToolCallLogsConfig]);

  /**
   * Read once when the app opens, in parallel with the session list and the suggestions.
   *
   * This is the one project setting the transcript reads - `showToolCalls` and
   * `showReasoning` decide whether tool calls and reasoning render - so unlike the other
   * settings it cannot wait for a drawer to be opened; it is needed on first paint, for
   * any conversation that already has messages. When the bootstrap carries the mode
   * (optional `toolCallLogs`), it is used and no request is made; otherwise
   * `GET tool-call-logs` provides it.
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    // No mode in the bootstrap: ask the service.
    if (bootstrapMode === undefined) {
      void loadConfig();
      return;
    }

    setOriginalMode(bootstrapMode);
    setState((prev) => ({
      ...prev,
      mode: bootstrapMode,
      isLoading: false,
      error: null,
      hasChanges: false,
    }));
    // `loadConfig` is re-created whenever its connector dependencies change, so
    // depending on it would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, bootstrapMode]);

  // Computed values for conditional rendering
  const showToolCalls = useMemo(
    () => state.mode === 'tools' || state.mode === 'all',
    [state.mode]
  );

  const showReasoning = useMemo(
    () => state.mode === 'thinking' || state.mode === 'all',
    [state.mode]
  );

  const value = useMemo(
    () => ({
      state,
      loadConfig,
      setMode,
      saveConfig,
      showToolCalls,
      showReasoning,
    }),
    [state, loadConfig, setMode, saveConfig, showToolCalls, showReasoning]
  );

  return (
    <ToolCallLogsConfigContext.Provider value={value}>
      {children}
    </ToolCallLogsConfigContext.Provider>
  );
};

/**
 * Hook to access Tool Call Logs config context
 */
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

export default ToolCallLogsConfigProvider;
