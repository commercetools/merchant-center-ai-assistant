/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Page Context (singular): fetches one stored page by key.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TComposedPage } from '../types/composed-page';
import { useComposedPageFetcher } from '../hooks/use-composed-pages-storage';

type TComposedPageContextValue = {
  page: TComposedPage | null;
  loading: boolean;
  error: Error | null;
};

const ComposedPageContext = createContext<TComposedPageContextValue | null>(
  null
);

export function ComposedPageProvider({
  children,
  pageKey,
}: {
  children: ReactNode;
  pageKey: string;
}) {
  const { page, loading, error } = useComposedPageFetcher(pageKey);

  const value: TComposedPageContextValue = useMemo(
    () => ({
      page,
      loading,
      error: error ? new Error(error.message) : null,
    }),
    [page, loading, error]
  );

  return (
    <ComposedPageContext.Provider value={value}>
      {children}
    </ComposedPageContext.Provider>
  );
}

export function useComposedPageContext(): TComposedPageContextValue {
  const context = useContext(ComposedPageContext);
  if (!context) {
    throw new Error(
      'useComposedPageContext must be used within a ComposedPageProvider'
    );
  }
  return context;
}
