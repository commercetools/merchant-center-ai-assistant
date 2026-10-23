/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { TPageSchema } from '../types/composed-page';

// Types
export type TPreviewData = {
  schema: TPageSchema; // Contains dataSources + script
  uri: string; // The ui://... identifier
};

export type TPreviewError = {
  message: string;
  uri: string;
  timestamp: number;
};

/**
 * Callback type for sending error feedback to chat
 */
export type TErrorFeedbackCallback = (error: TPreviewError) => void;

type TComposePreviewContextValue = {
  previewData: TPreviewData | null;
  setPreviewData: (data: TPreviewData | null) => void;
  clearPreview: () => void;
  // Error feedback mechanism
  reportPreviewError: (errorMessage: string) => void;
  setErrorFeedbackHandler: (handler: TErrorFeedbackCallback | null) => void;
};

type TComposePreviewProviderProps = {
  children: ReactNode;
  sessionId?: string | null;
};

// Context
const ComposePreviewContext = createContext<TComposePreviewContextValue | null>(
  null
);

/**
 * Provider component that manages compose preview state
 * Clears preview when sessionId changes (different chat session = different preview)
 */
export function ComposePreviewProvider({
  children,
  sessionId,
}: TComposePreviewProviderProps) {
  const [previewData, setPreviewDataState] = useState<TPreviewData | null>(
    null
  );

  // Track previous sessionId to detect changes
  const prevSessionIdRef = useRef<string | null | undefined>(sessionId);

  // Error feedback handler (set by ChatArea)
  const errorFeedbackHandlerRef = useRef<TErrorFeedbackCallback | null>(null);

  // Clear preview when sessionId changes
  useEffect(() => {
    if (
      prevSessionIdRef.current !== sessionId &&
      prevSessionIdRef.current !== undefined
    ) {
      // Session changed, clear the preview
      setPreviewDataState(null);
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  const setPreviewData = useCallback((data: TPreviewData | null) => {
    setPreviewDataState(data);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewDataState(null);
  }, []);

  /**
   * Set the error feedback handler (called by ChatArea)
   */
  const setErrorFeedbackHandler = useCallback(
    (handler: TErrorFeedbackCallback | null) => {
      errorFeedbackHandlerRef.current = handler;
    },
    []
  );

  /**
   * Report a preview error (called by ComposePreview when rendering fails)
   * This will send the error to the chat for the AI to potentially fix
   */
  const reportPreviewError = useCallback(
    (errorMessage: string) => {
      if (errorFeedbackHandlerRef.current && previewData) {
        const error: TPreviewError = {
          message: errorMessage,
          uri: previewData.uri,
          timestamp: Date.now(),
        };
        errorFeedbackHandlerRef.current(error);
      }
    },
    [previewData]
  );

  const value: TComposePreviewContextValue = useMemo(
    () => ({
      previewData,
      setPreviewData,
      clearPreview,
      reportPreviewError,
      setErrorFeedbackHandler,
    }),
    [
      previewData,
      setPreviewData,
      clearPreview,
      reportPreviewError,
      setErrorFeedbackHandler,
    ]
  );

  return (
    <ComposePreviewContext.Provider value={value}>
      {children}
    </ComposePreviewContext.Provider>
  );
}

/**
 * Hook to access compose preview context when the provider may be absent.
 * Returns `null` outside a `ComposePreviewProvider` so callers can render in
 * both cases without calling a Hook conditionally.
 */
export function useOptionalComposePreviewContext(): TComposePreviewContextValue | null {
  return useContext(ComposePreviewContext);
}

/**
 * Hook to access compose preview context
 */
export function useComposePreviewContext(): TComposePreviewContextValue {
  const context = useContext(ComposePreviewContext);
  if (!context) {
    throw new Error(
      'useComposePreviewContext must be used within a ComposePreviewProvider'
    );
  }
  return context;
}
