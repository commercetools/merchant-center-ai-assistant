/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { McpProviderStatus } from '../hooks/admin-types';
import { useAdminConnector } from '../hooks/use-admin-connector';

/**
 * Read-only status of the optional third-party providers (Contentstack, Algolia, Stripe).
 *
 * Provider credentials are Connect deployment configuration, so this context holds nothing
 * but the service's answer to `GET mcp/providers`: names and booleans. There is no save,
 * no toggle and no credential state in the browser.
 */
export interface McpProvidersContextType {
  providers: McpProviderStatus[];
  loading: boolean;
  error: string | null;
  /** Fetch again, replacing what is shown. */
  reload: () => Promise<void>;
  /** Fetch once, on first use (the first time the settings drawer opens). */
  ensureProvidersLoaded: () => Promise<void>;
}

const McpProvidersContext = createContext<McpProvidersContextType | null>(null);

export const McpProvidersProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { getMCPProviders } = useAdminConnector();
  const [providers, setProviders] = useState<McpProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMCPProviders();
      if (response.success) {
        setProviders(response.data);
      } else {
        setError('Failed to load the connected sources');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load connected sources'
      );
    } finally {
      setLoading(false);
    }
  }, [getMCPProviders]);

  const ensureProvidersLoaded = useCallback(async () => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    await reload();
  }, [reload]);

  const value = useMemo(
    () => ({ providers, loading, error, reload, ensureProvidersLoaded }),
    [providers, loading, error, reload, ensureProvidersLoaded]
  );

  return (
    <McpProvidersContext.Provider value={value}>
      {children}
    </McpProvidersContext.Provider>
  );
};

export const useMcpProviders = (): McpProvidersContextType => {
  const context = useContext(McpProvidersContext);
  if (!context) {
    throw new Error(
      'useMcpProviders must be used within a McpProvidersProvider'
    );
  }
  return context;
};
