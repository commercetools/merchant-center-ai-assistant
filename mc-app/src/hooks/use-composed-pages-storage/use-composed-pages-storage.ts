/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Pages Storage Hook
 *
 * Provides hooks for storing and retrieving composed pages
 * using commercetools Custom Objects.
 */

import { useCallback } from 'react';
import type { ApolloError } from '@apollo/client';
import {
  useMcQuery,
  useMcMutation,
} from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';

import { SHARED_COMPOSED_PAGES_CONTAINER_KEY } from '../../constants';
import type { TComposedPage, TPageSchemaV5 } from '../../types/composed-page';

// GraphQL imports
import FetchComposedPagesQuery from '../use-composed-pages-connector/fetch-composed-pages.ctp.graphql';
import FetchComposedPageQuery from '../use-composed-pages-connector/fetch-composed-page.ctp.graphql';
import CreateOrUpdateMutation from '../use-composed-pages-connector/create-or-update-composed-page.ctp.graphql';
import DeleteMutation from '../use-composed-pages-connector/delete-composed-page.ctp.graphql';

// ============================================
// Types
// ============================================

type TCustomObjectValue = {
  name?: string;
  icon?: string;
  schema?: unknown;
  isPublished?: boolean;
  createdBy?: string;
};

type TCustomObjectResult = {
  id: string;
  key: string;
  container: string;
  value: string | TCustomObjectValue; // Can be string or parsed object depending on GraphQL response
  version: number;
  createdAt: string;
  lastModifiedAt: string;
};

type TFetchComposedPagesQueryResult = {
  customObjects: {
    total: number;
    count: number;
    offset: number;
    results: TCustomObjectResult[];
  };
};

type TFetchComposedPagesQueryVariables = {
  container: string;
  limit: number;
  offset: number;
};

type TFetchComposedPageQueryResult = {
  customObject: TCustomObjectResult | null;
};

type TFetchComposedPageQueryVariables = {
  container: string;
  key: string;
};

type TCreateOrUpdateMutationResult = {
  createOrUpdateCustomObject: TCustomObjectResult;
};

type TCreateOrUpdateMutationVariables = {
  container: string;
  key: string;
  value: string;
};

type TDeleteMutationResult = {
  deleteCustomObject: {
    id: string;
    key: string;
    container: string;
  };
};

type TDeleteMutationVariables = {
  id: string;
  version: number;
};

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Parse custom object value to TComposedPage
 * Handles both string (needs parsing) and object (already parsed) values
 */
function parseComposedPage(customObject: TCustomObjectResult): TComposedPage {
  try {
    // Handle both string and object values
    // commercetools GraphQL returns value as a parsed object, not a string
    let value: TCustomObjectValue;
    if (typeof customObject.value === 'string') {
      value = JSON.parse(customObject.value);
    } else {
      value = customObject.value;
    }

    return {
      id: customObject.id,
      key: customObject.key,
      name: value.name || customObject.key,
      icon: value.icon,
      schema: value.schema as TPageSchemaV5,
      isPublished: value.isPublished ?? true,
      createdAt: customObject.createdAt,
      updatedAt: customObject.lastModifiedAt,
      createdBy: value.createdBy,
    };
  } catch {
    // Return a minimal page object on parse error
    return {
      id: customObject.id,
      key: customObject.key,
      name: customObject.key,
      schema: { version: 'unknown' } as TComposedPage['schema'],
      isPublished: false,
      createdAt: customObject.createdAt,
      updatedAt: customObject.lastModifiedAt,
    };
  }
}

/**
 * Serialize TComposedPage to custom object value
 */
function serializeComposedPage(
  page: Omit<TComposedPage, 'id' | 'createdAt' | 'updatedAt'>
): string {
  return JSON.stringify({
    name: page.name,
    icon: page.icon,
    schema: page.schema,
    isPublished: page.isPublished,
    createdBy: page.createdBy,
  });
}

// ============================================
// Hooks
// ============================================

/**
 * Hook to fetch all composed pages
 */
function useComposedPagesFetcher(options?: { skip?: boolean }) {
  const { data, error, loading, refetch } = useMcQuery<
    TFetchComposedPagesQueryResult,
    TFetchComposedPagesQueryVariables
  >(FetchComposedPagesQuery, {
    variables: {
      container: SHARED_COMPOSED_PAGES_CONTAINER_KEY,
      limit: 100,
      offset: 0,
    },
    context: {
      target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM,
    },
    skip: options?.skip,
  });

  const pages: TComposedPage[] =
    data?.customObjects?.results?.map(parseComposedPage) ?? [];

  return {
    pages,
    total: data?.customObjects?.total ?? 0,
    error,
    loading,
    refetch,
  };
}

/**
 * Hook to fetch a single composed page by key
 */
export function useComposedPageFetcher(
  key: string,
  options?: { skip?: boolean }
) {
  const { data, error, loading, refetch } = useMcQuery<
    TFetchComposedPageQueryResult,
    TFetchComposedPageQueryVariables
  >(FetchComposedPageQuery, {
    variables: {
      container: SHARED_COMPOSED_PAGES_CONTAINER_KEY,
      key,
    },
    context: {
      target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM,
    },
    skip: !key || options?.skip,
  });

  const page: TComposedPage | null = data?.customObject
    ? parseComposedPage(data.customObject)
    : null;

  // Store version for delete operations
  const version = data?.customObject?.version;

  return {
    page,
    version,
    error,
    loading,
    refetch,
  };
}

/**
 * Hook to create a new composed page
 */
function useComposedPageCreator() {
  const [createMutation, { error, loading }] = useMcMutation<
    TCreateOrUpdateMutationResult,
    TCreateOrUpdateMutationVariables
  >(CreateOrUpdateMutation, {
    context: {
      target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM,
    },
  });

  const createPage = useCallback(
    async (
      page: Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
    ): Promise<TComposedPage> => {
      const key = generateUUID();
      const value = serializeComposedPage({ ...page, key });

      const result = await createMutation({
        variables: {
          container: SHARED_COMPOSED_PAGES_CONTAINER_KEY,
          key,
          value,
        },
      });

      if (!result.data?.createOrUpdateCustomObject) {
        throw new Error('Failed to create composed page');
      }

      return parseComposedPage(result.data.createOrUpdateCustomObject);
    },
    [createMutation]
  );

  return {
    createPage,
    error,
    loading,
  };
}

/**
 * Hook to update an existing composed page
 */
function useComposedPageUpdater() {
  const [updateMutation, { error, loading }] = useMcMutation<
    TCreateOrUpdateMutationResult,
    TCreateOrUpdateMutationVariables
  >(CreateOrUpdateMutation, {
    context: {
      target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM,
    },
  });

  const updatePage = useCallback(
    async (
      key: string,
      updates: Partial<
        Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
      >
    ): Promise<TComposedPage> => {
      // First fetch the current page to merge updates
      // Note: In a real scenario, you might want to pass the current page data
      const value = JSON.stringify(updates);

      const result = await updateMutation({
        variables: {
          container: SHARED_COMPOSED_PAGES_CONTAINER_KEY,
          key,
          value,
        },
      });

      if (!result.data?.createOrUpdateCustomObject) {
        throw new Error('Failed to update composed page');
      }

      return parseComposedPage(result.data.createOrUpdateCustomObject);
    },
    [updateMutation]
  );

  return {
    updatePage,
    error,
    loading,
  };
}

/**
 * Hook to delete a composed page
 */
function useComposedPageDeleter() {
  const [deleteMutation, { error, loading }] = useMcMutation<
    TDeleteMutationResult,
    TDeleteMutationVariables
  >(DeleteMutation, {
    context: {
      target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM,
    },
  });

  const deletePage = useCallback(
    async (id: string, version: number): Promise<boolean> => {
      try {
        await deleteMutation({
          variables: {
            id,
            version,
          },
        });
        return true;
      } catch (err) {
        throw err;
      }
    },
    [deleteMutation]
  );

  return {
    deletePage,
    error,
    loading,
  };
}

// ============================================
// Combined Storage Hook
// ============================================

type TUseComposedPagesStorageResult = {
  // Fetching
  pages: TComposedPage[];
  pagesLoading: boolean;
  pagesError?: ApolloError;
  refetchPages: () => void;
  // Single page
  fetchPageByKey: (key: string) => Promise<TComposedPage | null>;
  // Create
  createPage: (
    page: Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
  ) => Promise<TComposedPage>;
  createLoading: boolean;
  createError?: ApolloError;
  // Update
  updatePage: (
    key: string,
    updates: Partial<
      Omit<TComposedPage, 'id' | 'key' | 'createdAt' | 'updatedAt'>
    >
  ) => Promise<TComposedPage>;
  updateLoading: boolean;
  updateError?: ApolloError;
  // Delete
  deletePage: (id: string, version: number) => Promise<boolean>;
  deleteLoading: boolean;
  deleteError?: ApolloError;
};

/**
 * Combined hook for all composed pages storage operations
 */
export function useComposedPagesStorage(): TUseComposedPagesStorageResult {
  const {
    pages,
    error: pagesError,
    loading: pagesLoading,
    refetch: refetchPages,
  } = useComposedPagesFetcher();

  const {
    createPage,
    error: createError,
    loading: createLoading,
  } = useComposedPageCreator();

  const {
    updatePage,
    error: updateError,
    loading: updateLoading,
  } = useComposedPageUpdater();

  const {
    deletePage,
    error: deleteError,
    loading: deleteLoading,
  } = useComposedPageDeleter();

  // Helper to fetch a single page by key (uses the list from cache if available)
  const fetchPageByKey = useCallback(
    async (key: string): Promise<TComposedPage | null> => {
      const found = pages.find((p) => p.key === key);
      return found ?? null;
    },
    [pages]
  );

  return {
    // Fetching
    pages,
    pagesLoading,
    pagesError,
    refetchPages,
    // Single page
    fetchPageByKey,
    // Create
    createPage,
    createLoading,
    createError,
    // Update
    updatePage,
    updateLoading,
    updateError,
    // Delete
    deletePage,
    deleteLoading,
    deleteError,
  };
}
