/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Data Sources Context
 *
 * Manages GraphQL and BigQuery data fetching for composed pages.
 * Holds its own state for data, loading, errors, and mounted status.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import type { TDataSource, TGraphQLVariable } from '../types/composed-page';
import { useGraphql, type GraphqlResponse } from '../hooks/use-graphql';

// Types
type TDataSourceState = {
  data: Record<string, unknown>;
  loading: Record<string, boolean>;
  errors: Record<string, Error | null>;
};

type TDataSourcesContextValue = TDataSourceState & {
  refetch: (dataSourceIds?: string[]) => void;
  /**
   * Refetch a specific data source with new variables.
   * Used by pagination/sorting to update query parameters.
   */
  refetchWithVariables: (
    dataSourceId: string,
    variables: Record<string, unknown>
  ) => void;
  isInitialized: boolean;
};

type TDataSourcesProviderProps = {
  children: ReactNode;
  dataSources: TDataSource[];
  context: {
    projectKey?: string;
    dataLocale?: string;
    userId?: string;
    urlParams?: Record<string, string>;
  };
};

// Context
const DataSourcesContext = createContext<TDataSourcesContextValue | null>(null);

/**
 * Resolves variable values from various sources.
 */
function resolveVariables(
  variables: TGraphQLVariable[] | undefined,
  context: {
    projectKey?: string;
    dataLocale?: string;
    userId?: string;
    urlParams?: Record<string, string>;
  }
): Record<string, unknown> {
  if (!variables || variables.length === 0) {
    return {};
  }

  const resolved: Record<string, unknown> = {};

  for (const variable of variables) {
    let value: unknown = variable.value;

    // Resolve from context
    if (variable.fromContext) {
      switch (variable.fromContext) {
        case 'projectKey':
          value = context.projectKey;
          break;
        case 'dataLocale':
          value = context.dataLocale;
          break;
        case 'userId':
          value = context.userId;
          break;
      }
    }

    // Resolve from URL params
    if (variable.fromUrl && context.urlParams) {
      const paramName = variable.fromUrl.replace(':', '');
      value = context.urlParams[paramName];
    }

    // Type conversion
    if (value !== undefined) {
      switch (variable.type) {
        case 'number':
          value = Number(value);
          break;
        case 'boolean':
          value = Boolean(value);
          break;
        case 'array':
          if (!Array.isArray(value)) {
            value = [value];
          }
          break;
        case 'string':
        default:
          value = String(value);
          break;
      }
    }

    resolved[variable.name] = value;
  }

  return resolved;
}

/**
 * Cleans up the GraphQL query string by removing extra whitespace.
 */
function cleanQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

/**
 * Provider component that manages data source state
 */
export function DataSourcesProvider({
  children,
  dataSources,
  context,
}: TDataSourcesProviderProps) {
  const { callGraphQL } = useGraphql();

  // Initialize loading state with all data sources set to true
  const initialLoadingState = (): Record<string, boolean> => {
    const loading: Record<string, boolean> = {};
    dataSources.forEach((ds) => {
      loading[ds.id] = true;
    });
    return loading;
  };

  // State
  const [state, setState] = useState<TDataSourceState>(() => ({
    data: {},
    loading: initialLoadingState(),
    errors: {},
  }));
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs to avoid stale closures
  const isMountedRef = useRef(true);
  const dataSourcesRef = useRef(dataSources);
  const contextRef = useRef(context);
  const isFetchingRef = useRef(false);
  const pollIntervalsRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Update refs when props change (but don't trigger re-fetch). Synced in an
  // effect, not during render: render must stay pure because React can replay
  // or discard it. Every reader below is an async callback that runs after
  // commit, so a post-commit sync is equivalent here.
  useEffect(() => {
    dataSourcesRef.current = dataSources;
    contextRef.current = context;
  }, [dataSources, context]);

  // Fetch a single data source
  const fetchDataSource = useCallback(
    async (
      dataSource: TDataSource
    ): Promise<{ data?: unknown; error?: Error }> => {
      try {
        // A page cannot run SQL any more. The BigQuery data source and the
        // POST /data-warehouse/query endpoint behind it are both gone - SQL over history
        // is a chat-only capability now.
        //
        // Reported explicitly rather than by falling through to the GraphQL branch: a
        // page stored before the removal still carries target: 'BIG_QUERY' with a SQL
        // string, and sending that to the GraphQL endpoint produces a parse error that
        // says nothing about the real cause.
        if ((dataSource.target as string) === 'BIG_QUERY') {
          return {
            error: new Error(
              `Data source "${dataSource.id}" uses a BigQuery SQL query, which pages no longer support. Ask the assistant to rebuild this page.`
            ),
          };
        } else {
          // Handle GraphQL data sources (default)
          const variables = resolveVariables(
            dataSource.variables,
            contextRef.current
          );
          const cleanedQuery = cleanQuery(dataSource.query);

          const response = await callGraphQL(cleanedQuery, variables).catch(
            (error): GraphqlResponse => {
              return { errors: error.body.errors };
            }
          );

          if (response?.errors && response.errors.length > 0) {
            const errorMessage = response.errors
              .map((e: { message: string }) => e.message)
              .join(', ');
            return { error: new Error(errorMessage) };
          }

          return { data: response?.data ?? response };
        }
      } catch (err) {
        return {
          error: err instanceof Error ? err : new Error('Failed to fetch data'),
        };
      }
    },
    [callGraphQL]
  );

  // Fetch all or specific data sources
  const fetchAll = useCallback(
    async (dataSourceIds?: string[]) => {
      // Prevent concurrent fetches
      if (isFetchingRef.current && !dataSourceIds) {
        return;
      }

      const currentDataSources = dataSourcesRef.current;
      const requestedIds = dataSourceIds ? new Set(dataSourceIds) : null;
      const sourcesToFetch = requestedIds
        ? currentDataSources.filter((ds) => requestedIds.has(ds.id))
        : currentDataSources;

      if (sourcesToFetch.length === 0) {
        setIsInitialized(true);
        return;
      }

      if (!dataSourceIds) {
        isFetchingRef.current = true;
      }

      // Set loading state
      if (isMountedRef.current) {
        setState((prev) => {
          const loadingState: Record<string, boolean> = {};
          sourcesToFetch.forEach((source) => {
            loadingState[source.id] = true;
          });
          return {
            ...prev,
            loading: { ...prev.loading, ...loadingState },
          };
        });
      }

      // Fetch all in parallel
      const results = await Promise.all(
        sourcesToFetch.map(async (source) => {
          const result = await fetchDataSource(source);
          return { id: source.id, ...result };
        })
      );

      // Update state with results
      if (isMountedRef.current) {
        setState((prev) => {
          const newData = { ...prev.data };
          const newLoading = { ...prev.loading };
          const newErrors = { ...prev.errors };

          results.forEach((result) => {
            newLoading[result.id] = false;
            if (result.error) {
              newErrors[result.id] = result.error;
            } else {
              newData[result.id] = result.data;
              newErrors[result.id] = null;
            }
          });

          return {
            data: newData,
            loading: newLoading,
            errors: newErrors,
          };
        });

        setIsInitialized(true);
      }

      if (!dataSourceIds) {
        isFetchingRef.current = false;
      }
    },
    [fetchDataSource]
  );

  // Refetch function exposed to consumers
  const refetch = useCallback(
    (dataSourceIds?: string[]) => {
      fetchAll(dataSourceIds);
    },
    [fetchAll]
  );

  // State to hold variable overrides for data sources
  const variableOverridesRef = useRef<Record<string, Record<string, unknown>>>(
    {}
  );

  // Refetch a single data source with new variables (for pagination/sorting)
  const refetchWithVariables = useCallback(
    async (dataSourceId: string, variables: Record<string, unknown>) => {
      const dataSource = dataSourcesRef.current.find(
        (ds) => ds.id === dataSourceId
      );
      if (!dataSource) {
        return;
      }

      // Store the variable overrides
      variableOverridesRef.current[dataSourceId] = {
        ...variableOverridesRef.current[dataSourceId],
        ...variables,
      };

      // Set loading state
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          loading: { ...prev.loading, [dataSourceId]: true },
        }));
      }

      try {
        // Legacy BigQuery source: no variables to override, and `fetchDataSource`
        // reports it as unsupported.
        if ((dataSource.target as string) === 'BIG_QUERY') {
          const result = await fetchDataSource(dataSource);
          if (isMountedRef.current) {
            setState((prev) => ({
              ...prev,
              data: { ...prev.data, [dataSourceId]: result.data },
              loading: { ...prev.loading, [dataSourceId]: false },
              errors: {
                ...prev.errors,
                [dataSourceId]: result.error ?? null,
              },
            }));
          }
          return;
        }

        // For GraphQL, merge the variable overrides with resolved variables
        const baseVariables = resolveVariables(
          dataSource.variables,
          contextRef.current
        );
        const mergedVariables = {
          ...baseVariables,
          ...variableOverridesRef.current[dataSourceId],
        };

        const cleanedQuery = cleanQuery(dataSource.query);
        const response = await callGraphQL(cleanedQuery, mergedVariables).catch(
          (error): GraphqlResponse => {
            return {
              errors: error.body?.errors || [{ message: error.message }],
            };
          }
        );

        if (isMountedRef.current) {
          if (response?.errors && response.errors.length > 0) {
            const errorMessage = response.errors
              .map((e: { message: string }) => e.message)
              .join(', ');
            setState((prev) => ({
              ...prev,
              loading: { ...prev.loading, [dataSourceId]: false },
              errors: {
                ...prev.errors,
                [dataSourceId]: new Error(errorMessage),
              },
            }));
          } else {
            setState((prev) => ({
              ...prev,
              data: {
                ...prev.data,
                [dataSourceId]: response?.data ?? response,
              },
              loading: { ...prev.loading, [dataSourceId]: false },
              errors: { ...prev.errors, [dataSourceId]: null },
            }));
          }
        }
      } catch (err) {
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            loading: { ...prev.loading, [dataSourceId]: false },
            errors: {
              ...prev.errors,
              [dataSourceId]:
                err instanceof Error ? err : new Error('Failed to fetch data'),
            },
          }));
        }
      }
    },
    [callGraphQL, fetchDataSource]
  );

  // Initial fetch on mount - only once
  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch
    fetchAll();

    return () => {
      isMountedRef.current = false;
    };
    // Empty dependency array - only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Setup polling intervals separately
  useEffect(() => {
    // Clear existing intervals
    Object.values(pollIntervalsRef.current).forEach(clearInterval);
    pollIntervalsRef.current = {};

    // Setup new intervals
    dataSources.forEach((source) => {
      if (source.pollInterval && source.pollInterval > 0) {
        pollIntervalsRef.current[source.id] = setInterval(() => {
          if (isMountedRef.current) {
            fetchAll([source.id]);
          }
        }, source.pollInterval);
      }
    });

    return () => {
      Object.values(pollIntervalsRef.current).forEach(clearInterval);
      pollIntervalsRef.current = {};
    };
  }, [dataSources, fetchAll]);

  const value: TDataSourcesContextValue = useMemo(
    () => ({
      ...state,
      refetch,
      refetchWithVariables,
      isInitialized,
    }),
    [state, refetch, refetchWithVariables, isInitialized]
  );

  return (
    <DataSourcesContext.Provider value={value}>
      {children}
    </DataSourcesContext.Provider>
  );
}

/**
 * Hook to access data sources context
 */
export function useDataSourcesContext(): TDataSourcesContextValue {
  const context = useContext(DataSourcesContext);
  if (!context) {
    throw new Error(
      'useDataSourcesContext must be used within a DataSourcesProvider'
    );
  }
  return context;
}
