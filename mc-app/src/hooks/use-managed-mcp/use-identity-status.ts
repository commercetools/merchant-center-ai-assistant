/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/auth';
import { useIdentityMcpConfig } from './use-identity-mcp-config';

export interface IdentityStatus {
  /** `null` while unknown. */
  connected: boolean | null;
  loading: boolean;
  /**
   * Re-read the status. When the bootstrap carries `identityUserConnected` the caller's
   * `useAuth().refresh()` already updates it, so only the fallback path makes a request.
   */
  recheck: () => Promise<void>;
}

/**
 * Whether the signed-in user has connected their own Merchant Center account to the bound
 * Managed MCP Server.
 *
 * The session bootstrap supplies `identityUserConnected`; that value is used directly and
 * no request is made. Only when the service did not send it, and `enabled` is true (a
 * server is bound), does the hook call `GET managed-mcp-identity/status` once. A failed
 * call counts as "not connected" so the user lands on the connect gate, not a blank page.
 */
export const useIdentityStatus = (enabled: boolean): IdentityStatus => {
  const { identityUserConnected } = useAuth();
  const { fetchStatus } = useIdentityMcpConfig();
  const [fetched, setFetched] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const requested = useRef(false);

  const read = useCallback(async () => {
    setLoading(true);
    try {
      const status = await fetchStatus();
      setFetched(status.connected);
    } catch {
      setFetched(false);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!enabled) {
      requested.current = false;
      setFetched(null);
      return;
    }
    if (identityUserConnected !== undefined || requested.current) return;
    requested.current = true;
    void read();
  }, [enabled, identityUserConnected, read]);

  const recheck = useCallback(async () => {
    if (identityUserConnected === undefined && enabled) await read();
  }, [enabled, identityUserConnected, read]);

  const connected = !enabled ? null : identityUserConnected ?? fetched;
  return { connected, loading, recheck };
};
