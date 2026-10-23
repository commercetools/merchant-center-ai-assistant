/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/hooks/use-mc-session/index.ts: the call goes through `useFetch`
// so the `customView` flag is on it, and nothing identifying is sent by the browser.

import { useCallback } from 'react';
import { ForwardToError } from '../../utils/forward-to';
import { useFetch } from '../use-fetch';
import { useChatServiceEndpoint } from '../use-chat-service-endpoint';

export type ToolCallLogsMode = 'none' | 'thinking' | 'tools' | 'all';

export type McSessionBootstrap = {
  projectKey: string;
  /** Verified Merchant Center user id (read-only display in the footer). */
  userId: string;
  /** True when the project has an identity-mode managed MCP binding. */
  identityMcpConfigured: boolean;
  /** Stored but never read by the panel: it has no admin-only control. */
  isAdmin: boolean;
  identityUserConnected?: boolean;
  toolCallLogs?: ToolCallLogsMode;
};

type BootstrapResponse = {
  success: boolean;
  data?: Partial<McSessionBootstrap> & { projectKey: string; userId: string };
  error?: string;
};

/** Thrown by the bootstrap: `status` is the HTTP status, or `null` for non-HTTP failures. */
export class BootstrapError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'BootstrapError';
    this.status = status;
  }
}

export const useMcSession = () => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  const fetchWithFlags = useFetch();

  const bootstrapSession =
    useCallback(async (): Promise<McSessionBootstrap> => {
      if (!chatServiceEndpointUrl) {
        throw new BootstrapError(
          'chatServiceEndpointUrl is not configured',
          null
        );
      }

      const uri = `${chatServiceEndpointUrl.replace(/\/$/, '')}/auth/session`;

      let res: Response;
      try {
        res = await fetchWithFlags(uri, { method: 'POST', body: '{}' });
      } catch (err) {
        throw new BootstrapError(
          err instanceof Error ? err.message : 'The service is unreachable',
          null
        );
      }

      // Read `ok` before parsing: an error page is not JSON.
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new BootstrapError(
          new ForwardToError(uri, res.status, text).message,
          res.status
        );
      }

      let envelope: BootstrapResponse | undefined;
      try {
        envelope = (await res.json()) as BootstrapResponse;
      } catch {
        throw new BootstrapError(
          'The service answered with invalid data',
          null
        );
      }

      if (!envelope?.success || !envelope.data) {
        throw new BootstrapError(
          envelope?.error || 'Failed to establish session',
          null
        );
      }

      const { data } = envelope;
      return {
        projectKey: data.projectKey,
        userId: data.userId,
        identityMcpConfigured: Boolean(data.identityMcpConfigured),
        isAdmin: data.isAdmin === true,
        identityUserConnected: data.identityUserConnected,
        toolCallLogs: data.toolCallLogs,
      };
    }, [chatServiceEndpointUrl, fetchWithFlags]);

  return { bootstrapSession };
};
