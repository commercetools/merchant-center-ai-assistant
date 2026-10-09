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
  type ReactNode,
  useRef,
} from 'react';
import { useAdminConnector } from '../hooks/use-admin-connector';
import { isAdminRequiredError } from '../utils/admin-error';

const ADMIN_REQUIRED_TEXT = 'Administrator access required';

/**
 * System Prompt configuration state
 */
export interface SystemPromptConfigState {
  systemPrompt: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasChanges: boolean;
}

/**
 * Context value type
 */
export interface SystemPromptConfigContextType {
  // State
  state: SystemPromptConfigState;

  // Methods
  loadConfig: () => Promise<void>;
  /** Load once, on first use. See the provider. */
  ensureLoaded: () => Promise<void>;
  setSystemPrompt: (value: string) => void;
  saveConfig: () => Promise<boolean>;
}

const defaultState: SystemPromptConfigState = {
  systemPrompt: '',
  isLoading: true,
  isSaving: false,
  error: null,
  hasChanges: false,
};

const SystemPromptConfigContext =
  createContext<SystemPromptConfigContextType | null>(null);

interface SystemPromptConfigProviderProps {
  children: ReactNode;
}

/**
 * Provider component for System Prompt configuration
 */
export const SystemPromptConfigProvider: React.FC<
  SystemPromptConfigProviderProps
> = ({ children }) => {
  const { getSystemPromptConfig, setSystemPromptConfig } = useAdminConnector();

  const [state, setState] = useState<SystemPromptConfigState>(defaultState);
  const [originalSystemPrompt, setOriginalSystemPrompt] = useState<string>('');

  /**
   * Load configuration from server
   */
  const loadConfig = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await getSystemPromptConfig();

      if (response.success) {
        const systemPrompt = response.data.systemPrompt;
        setState((prev) => ({
          ...prev,
          systemPrompt,
          isLoading: false,
          hasChanges: false,
        }));
        setOriginalSystemPrompt(systemPrompt);
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load System Prompt configuration',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: isAdminRequiredError(err)
          ? ADMIN_REQUIRED_TEXT
          : err instanceof Error
            ? err.message
            : 'Failed to load config',
      }));
    }
  }, [getSystemPromptConfig]);

  /**
   * Set the system prompt value
   */
  const setSystemPrompt = useCallback(
    (value: string) => {
      setState((prev) => ({
        ...prev,
        systemPrompt: value,
        hasChanges: value !== originalSystemPrompt,
      }));
    },
    [originalSystemPrompt]
  );

  /**
   * Save configuration
   */
  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!state.hasChanges) return true;

    setState((prev) => ({ ...prev, isSaving: true, error: null }));

    try {
      const response = await setSystemPromptConfig(state.systemPrompt);

      if (response.success) {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          hasChanges: false,
        }));
        setOriginalSystemPrompt(state.systemPrompt);
        return true;
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (err) {
      // The stored value is untouched on a refusal; the edit stays in the field.
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: isAdminRequiredError(err)
          ? ADMIN_REQUIRED_TEXT
          : err instanceof Error
            ? err.message
            : 'Failed to save',
      }));
      return false;
    }
  }, [state.systemPrompt, state.hasChanges, setSystemPromptConfig]);

  /**
   * Load once, on first use. Call this from whatever surface displays the data.
   *
   * These settings used to load from a mount effect, which meant every page load fired
   * the request whether or not anyone opened the panel that reads it - putting it in the
   * same burst as the session and message reads and making all of them slower (the
   * requests contend server-side; see docs/app-load-latency.md). Nothing here is on the
   * first-paint path, so nothing here should be fetched before it is asked for.
   *
   * Idempotent: repeated calls after the first are no-ops, so an `isOpen` effect can call
   * it on every open. Use `loadConfig` directly to force a refresh.
   */
  const hasLoaded = useRef(false);
  const ensureLoaded = useCallback(async () => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    await loadConfig();
  }, [loadConfig]);

  const value = useMemo(
    () => ({
      state,
      loadConfig,
      ensureLoaded,
      setSystemPrompt,
      saveConfig,
    }),
    [state, loadConfig, ensureLoaded, setSystemPrompt, saveConfig]
  );

  return (
    <SystemPromptConfigContext.Provider value={value}>
      {children}
    </SystemPromptConfigContext.Provider>
  );
};

/**
 * Hook to access System Prompt config context
 */
export const useSystemPromptConfigContext =
  (): SystemPromptConfigContextType => {
    const context = useContext(SystemPromptConfigContext);
    if (!context) {
      throw new Error(
        'useSystemPromptConfigContext must be used within a SystemPromptConfigProvider'
      );
    }
    return context;
  };

export default SystemPromptConfigProvider;
