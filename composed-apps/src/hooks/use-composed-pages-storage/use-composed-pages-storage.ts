/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Read-only access to composed pages stored as commercetools Custom Objects.
 * This app never writes pages: the AI Assistant creates them.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMcQuery } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';

import { SHARED_COMPOSED_PAGES_CONTAINER_KEY } from '../../constants';
import type { TComposedPage } from '../../types/composed-page';
import { parseComposedPage, type TCustomObjectResult } from './parse';
import { PAGE_SIZE, isTruncated, remainingOffsets } from './paginate';

import FetchComposedPagesQuery from '../use-composed-pages-connector/fetch-composed-pages.ctp.graphql';
import FetchComposedPageQuery from '../use-composed-pages-connector/fetch-composed-page.ctp.graphql';

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
  sort: string[];
};

type TFetchComposedPageQueryResult = {
  customObject: TCustomObjectResult | null;
};

type TFetchComposedPageQueryVariables = {
  container: string;
  key: string;
};

/** Loads the list in requests of PAGE_SIZE rows, sorted by creation date for stable paging. */
export function useComposedPagesFetcher() {
  const { data, error, loading, fetchMore } = useMcQuery<
    TFetchComposedPagesQueryResult,
    TFetchComposedPagesQueryVariables
  >(FetchComposedPagesQuery, {
    variables: {
      container: SHARED_COMPOSED_PAGES_CONTAINER_KEY,
      limit: PAGE_SIZE,
      offset: 0,
      sort: ['createdAt asc'],
    },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<Error | undefined>();
  const [extra, setExtra] = useState<TCustomObjectResult[]>([]);
  const generation = useRef(0);

  const total = data?.customObjects?.total ?? 0;
  const firstResults = data?.customObjects?.results;

  useEffect(() => {
    // A new first page restarts the remaining requests.
    generation.current += 1;
    const current = generation.current;
    setExtra([]);
    setMoreError(undefined);
    if (!firstResults) return;
    const offsets = remainingOffsets(total);
    if (offsets.length === 0) return;

    setMoreLoading(true);
    void (async () => {
      const collected: TCustomObjectResult[] = [];
      try {
        for (const offset of offsets) {
          const result = await fetchMore({ variables: { offset } });
          if (current !== generation.current) return;
          collected.push(...(result.data?.customObjects?.results ?? []));
        }
        setExtra(collected);
      } catch (err) {
        if (current === generation.current) {
          setMoreError(
            err instanceof Error ? err : new Error('Failed to load pages')
          );
        }
      } finally {
        if (current === generation.current) setMoreLoading(false);
      }
    })();
  }, [firstResults, total, fetchMore]);

  const pages: TComposedPage[] = useMemo(() => {
    const seen = new Set<string>();
    return [...(firstResults ?? []), ...extra]
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .map(parseComposedPage);
  }, [firstResults, extra]);

  return {
    pages,
    total,
    truncated: isTruncated(total),
    error: error ?? moreError,
    loading: loading || moreLoading,
  };
}

/** Fetches a single composed page by key. */
export function useComposedPageFetcher(key: string) {
  const { data, error, loading } = useMcQuery<
    TFetchComposedPageQueryResult,
    TFetchComposedPageQueryVariables
  >(FetchComposedPageQuery, {
    variables: { container: SHARED_COMPOSED_PAGES_CONTAINER_KEY, key },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
    skip: !key,
  });

  const page: TComposedPage | null = data?.customObject
    ? parseComposedPage(data.customObject)
    : null;

  return { page, error, loading };
}
