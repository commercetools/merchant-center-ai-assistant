/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Composed Pages Context (plural): the read-only list of stored pages.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TComposedPage } from '../types/composed-page';
import { useComposedPagesFetcher } from '../hooks/use-composed-pages-storage';

type TComposedPagesContextValue = {
  pages: TComposedPage[];
  total: number;
  /** True when the container holds more pages than the list loads. */
  truncated: boolean;
  loading: boolean;
  error: Error | null;
};

const ComposedPagesContext = createContext<TComposedPagesContextValue | null>(
  null
);

export function ComposedPagesProvider({ children }: { children: ReactNode }) {
  const { pages, total, truncated, loading, error } = useComposedPagesFetcher();

  const value: TComposedPagesContextValue = useMemo(
    () => ({
      pages,
      total,
      truncated,
      loading,
      error: error ? new Error(error.message) : null,
    }),
    [pages, total, truncated, loading, error]
  );

  return (
    <ComposedPagesContext.Provider value={value}>
      {children}
    </ComposedPagesContext.Provider>
  );
}

export function useComposedPagesContext(): TComposedPagesContextValue {
  const context = useContext(ComposedPagesContext);
  if (!context) {
    throw new Error(
      'useComposedPagesContext must be used within a ComposedPagesProvider'
    );
  }
  return context;
}
