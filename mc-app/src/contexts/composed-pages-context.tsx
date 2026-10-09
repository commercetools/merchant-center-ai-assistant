/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Pages Context (Plural)
 *
 * Manages the list of all composed pages and CRUD operations.
 * Uses commercetools Custom Objects for storage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import type { TComposedPage } from '../types/composed-page';
import { useComposedPagesStorage } from '../hooks/use-composed-pages-storage';

// ============================================
// Types
// ============================================

type TComposedPagesContextValue = {
  // Pages list
  pages: TComposedPage[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;

  // Create
  createPage: (
    page: Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
  ) => Promise<TComposedPage>;
  createLoading: boolean;
  createError: Error | null;

  // Update
  updatePage: (
    key: string,
    updates: Partial<
      Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
    >
  ) => Promise<TComposedPage>;
  updateLoading: boolean;
  updateError: Error | null;

  // Delete
  deletePage: (id: string, version: number) => Promise<boolean>;
  deleteLoading: boolean;
  deleteError: Error | null;
};

type TComposedPagesProviderProps = {
  children: ReactNode;
};

// ============================================
// Context
// ============================================

const ComposedPagesContext = createContext<TComposedPagesContextValue | null>(
  null
);

// ============================================
// Provider
// ============================================

/**
 * Provider component that manages composed pages list and CRUD operations
 */
export function ComposedPagesProvider({
  children,
}: TComposedPagesProviderProps) {
  // Fetch all pages
  const {
    pages: fetchedPages,
    pagesLoading,
    pagesError,
    refetchPages,
    createPage: createPageMutation,
    createLoading,
    createError: createMutationError,
    updatePage: updatePageMutation,
    updateLoading,
    updateError: updateMutationError,
    deletePage: deletePageMutation,
    deleteLoading,
    deleteError: deleteMutationError,
  } = useComposedPagesStorage();

  // Local state for optimistic updates
  const [localPages, setLocalPages] = useState<TComposedPage[] | null>(null);

  // Use local pages if available (after mutations), otherwise use fetched pages
  const pages = localPages ?? fetchedPages;

  // Local error states
  const [createError, setCreateError] = useState<Error | null>(null);
  const [updateError, setUpdateError] = useState<Error | null>(null);
  const [deleteError, setDeleteError] = useState<Error | null>(null);

  // Refetch and clear local state
  const handleRefetch = useCallback(() => {
    setLocalPages(null);
    refetchPages();
  }, [refetchPages]);

  // Create page and update local list
  const createPage = useCallback(
    async (
      page: Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
    ): Promise<TComposedPage> => {
      setCreateError(null);
      try {
        const newPage = await createPageMutation(page);
        // Add to local pages list
        handleRefetch();
        return newPage;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to create page');
        setCreateError(error);
        throw error;
      }
    },
    [createPageMutation, handleRefetch]
  );

  // Update page and update local list
  const updatePage = useCallback(
    async (
      key: string,
      updates: Partial<
        Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
      >
    ): Promise<TComposedPage> => {
      setUpdateError(null);
      try {
        const updatedPage = await updatePageMutation(key, updates);
        // Update in local pages list
        handleRefetch();
        return updatedPage;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to update page');
        setUpdateError(error);
        throw error;
      }
    },
    [updatePageMutation, handleRefetch]
  );

  // Delete page and update local list
  const deletePage = useCallback(
    async (id: string, version: number): Promise<boolean> => {
      setDeleteError(null);
      try {
        const result = await deletePageMutation(id, version);
        // Remove from local pages list
        handleRefetch();
        return result;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to delete page');
        setDeleteError(error);
        throw error;
      }
    },
    [deletePageMutation, handleRefetch]
  );

  const value: TComposedPagesContextValue = useMemo(
    () => ({
      // Pages list
      pages,
      loading: pagesLoading,
      error: pagesError ? new Error(pagesError.message) : null,
      refetch: handleRefetch,

      // Create
      createPage,
      createLoading,
      createError:
        createError ||
        (createMutationError ? new Error(createMutationError.message) : null),

      // Update
      updatePage,
      updateLoading,
      updateError:
        updateError ||
        (updateMutationError ? new Error(updateMutationError.message) : null),

      // Delete
      deletePage,
      deleteLoading,
      deleteError:
        deleteError ||
        (deleteMutationError ? new Error(deleteMutationError.message) : null),
    }),
    [
      pages,
      pagesLoading,
      pagesError,
      handleRefetch,
      createPage,
      createLoading,
      createError,
      createMutationError,
      updatePage,
      updateLoading,
      updateError,
      updateMutationError,
      deletePage,
      deleteLoading,
      deleteError,
      deleteMutationError,
    ]
  );

  return (
    <ComposedPagesContext.Provider value={value}>
      {children}
    </ComposedPagesContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access composed pages context
 */
export function useComposedPagesContext(): TComposedPagesContextValue {
  const context = useContext(ComposedPagesContext);
  if (!context) {
    throw new Error(
      'useComposedPagesContext must be used within a ComposedPagesProvider'
    );
  }
  return context;
}
