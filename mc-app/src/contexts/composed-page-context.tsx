/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Page Context (Singular)
 *
 * Manages a single composed page's schema fetching and state.
 * Uses commercetools Custom Objects for storage.
 *
 * Note: For operations on the pages list (create, delete, etc.),
 * use ComposedPagesContext (plural) instead.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import type { TComposedPage } from '../types/composed-page';
import { useComposedPageFetcher } from '../hooks/use-composed-pages-storage';
import { useComposedPagesContext } from './composed-pages-context';

// Types
type TComposedPageContextValue = {
  page: TComposedPage | null;
  loading: boolean;
  error: Error | null;
  isInitialized: boolean;
  refetch: () => void;
  deletePage: () => Promise<boolean>;
  deleteLoading: boolean;
  deleteError: Error | null;
};

type TComposedPageProviderProps = {
  children: ReactNode;
  pageKey: string;
};

// Context
const ComposedPageContext = createContext<TComposedPageContextValue | null>(
  null
);

/**
 * Provider component that manages composed page state
 */
export function ComposedPageProvider({
  children,
  pageKey,
}: TComposedPageProviderProps) {
  const { page, version, loading, error, refetch } =
    useComposedPageFetcher(pageKey);

  // Use ComposedPagesContext for delete operations (updates the pages list)
  const {
    deletePage: deletePageFromContext,
    deleteLoading,
    deleteError,
  } = useComposedPagesContext();

  // Track initialization
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      isInitializedRef.current = true;
    }
  }, [loading]);

  // Create error object if page not found after loading. Memoized so the
  // context value below is not invalidated by a fresh Error every render.
  const pageError = useMemo(
    () =>
      !loading && !page && pageKey
        ? new Error(`Page not found: ${pageKey}`)
        : error
        ? new Error(error.message)
        : null,
    [loading, page, pageKey, error]
  );

  // Delete page handler - uses ComposedPagesContext to update the list
  const deletePage = useCallback(async (): Promise<boolean> => {
    if (!page?.id || version === undefined) {
      throw new Error('Cannot delete page: missing id or version');
    }
    return deletePageFromContext(page.id, version);
  }, [page?.id, version, deletePageFromContext]);

  const value: TComposedPageContextValue = useMemo(
    () => ({
      page,
      loading,
      error: pageError,
      // `isInitializedRef.current` is only written by the effect keyed on
      // `loading`, so `loading` is a sufficient dependency for it here.
      isInitialized: isInitializedRef.current || !loading,
      refetch,
      deletePage,
      deleteLoading,
      deleteError,
    }),
    [page, loading, pageError, refetch, deletePage, deleteLoading, deleteError]
  );

  return (
    <ComposedPageContext.Provider value={value}>
      {children}
    </ComposedPageContext.Provider>
  );
}

/**
 * Hook to access composed page context
 */
export function useComposedPageContext(): TComposedPageContextValue {
  const context = useContext(ComposedPageContext);
  if (!context) {
    throw new Error(
      'useComposedPageContext must be used within a ComposedPageProvider'
    );
  }
  return context;
}
