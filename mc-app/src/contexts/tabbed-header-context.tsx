/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Tabbed Header Context
 *
 * Manages tab highlighting functionality for the TabbedHeader component.
 * Allows other components to highlight a tab with animation.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import type { TabId } from '../components/shell/view-tabs';

export type HighlightedTab = TabId | 'composed-page';

// ============================================
// Types
// ============================================

type TTabbedHeaderContextValue = {
  // Current highlighted tab (null if none)
  highlightedTab: HighlightedTab | null;

  // Highlight a tab - will show animation for 10 seconds or until clicked
  highlightTab: (tabId: HighlightedTab) => void;

  // Clear highlight (called when tab is clicked)
  clearHighlight: () => void;
};

type TTabbedHeaderProviderProps = {
  children: ReactNode;
};

// Duration for the highlight animation in milliseconds (10 seconds)
const HIGHLIGHT_DURATION_MS = 10000;

// ============================================
// Context
// ============================================

const TabbedHeaderContext = createContext<TTabbedHeaderContextValue | null>(
  null
);

// ============================================
// Provider
// ============================================

/**
 * Provider component that manages tab highlighting state
 */
export function TabbedHeaderProvider({ children }: TTabbedHeaderProviderProps) {
  const [highlightedTab, setHighlightedTab] = useState<HighlightedTab | null>(
    null
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any existing timeout
  const clearTimeout = useCallback(() => {
    if (timeoutRef.current) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Highlight a tab
  const highlightTab = useCallback(
    (tabId: HighlightedTab) => {
      // Clear any existing timeout
      clearTimeout();

      // Set the highlighted tab
      setHighlightedTab(tabId);

      // Auto-clear after duration
      timeoutRef.current = globalThis.setTimeout(() => {
        setHighlightedTab(null);
      }, HIGHLIGHT_DURATION_MS);
    },
    [clearTimeout]
  );

  // Clear highlight (when tab is clicked)
  const clearHighlight = useCallback(() => {
    clearTimeout();
    setHighlightedTab(null);
  }, [clearTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout();
    };
  }, [clearTimeout]);

  const value: TTabbedHeaderContextValue = useMemo(
    () => ({
      highlightedTab,
      highlightTab,
      clearHighlight,
    }),
    [highlightedTab, highlightTab, clearHighlight]
  );

  return (
    <TabbedHeaderContext.Provider value={value}>
      {children}
    </TabbedHeaderContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access tabbed header context
 */
export function useTabbedHeaderContext(): TTabbedHeaderContextValue {
  const context = useContext(TabbedHeaderContext);
  if (!context) {
    throw new Error(
      'useTabbedHeaderContext must be used within a TabbedHeaderProvider'
    );
  }
  return context;
}
