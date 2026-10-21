/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback } from 'react';
import { forwardToJson } from '../../utils/forward-to';
import { useChatServiceEndpoint } from '../use-chat-service-endpoint';

/**
 * Establish the session with the chat service.
 *
 * Like every other service call, this goes through the Merchant Center API's
 * `/proxy/forward-to` gateway (`utils/forward-to.ts`): the gateway authenticates the
 * user's Merchant Center session and injects a short-lived, asymmetrically signed JWT that
 * the service verifies. The service therefore learns who is calling and which project they
 * are in as verified claims, on this call and on every one that follows. Nothing identifying
 * is sent by the browser: no e-mail, no team, no session id, no query string.
 */

export type ToolCallLogsMode = 'none' | 'thinking' | 'tools' | 'all';

export type McSessionBootstrap = {
  projectKey: string;
  /** Merchant Center user id from the verified gateway token (read-only display). */
  userId: string;
  /** True when the project has an identity-mode managed MCP binding. */
  identityMcpConfigured: boolean;
  /**
   * Decided by the service: the verified user id is in `ADMIN_USER_IDS`. A missing field is
   * treated as false (fail closed). UX hint only; the service enforces admin on every route.
   */
  isAdmin: boolean;
  /**
   * Decided by the service: this user may write the shared Managed MCP binding (an
   * administrator, or anyone while `MCP_BINDING_OPEN_TO_ALL` is on). Missing means false.
   */
  canManageMcpBinding: boolean;
  /** Optional (contributed by the identity change): this user completed OAuth. */
  identityUserConnected?: boolean;
  /** Optional (contributed by the persistence change): transcript detail mode. */
  toolCallLogs?: ToolCallLogsMode;
};

type BootstrapResponse = {
  success: boolean;
  data?: Partial<McSessionBootstrap> & { projectKey: string; userId: string };
  error?: string;
};

export const useMcSession = () => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();

  const bootstrapSession =
    useCallback(async (): Promise<McSessionBootstrap> => {
      if (!chatServiceEndpointUrl) {
        throw new Error('chatServiceEndpointUrl is not configured');
      }

      // The service verifies the gateway token against `MC_AUDIENCE` + this exact path, so
      // the two must agree; `forwardToFetch` sends `audiencePolicy: 'forward-url-full-path'`.
      // No query string at all: the service's feature-flag middleware reads every
      // non-reserved query parameter as a filter.
      const uri = `${chatServiceEndpointUrl.replace(/\/$/, '')}/auth/session`;

      const envelope = await forwardToJson<BootstrapResponse>(uri, {
        method: 'POST',
        body: '{}',
      });

      if (!envelope?.success || !envelope.data) {
        throw new Error(envelope?.error || 'Failed to establish session');
      }

      const { data } = envelope;
      return {
        projectKey: data.projectKey,
        userId: data.userId,
        identityMcpConfigured: Boolean(data.identityMcpConfigured),
        isAdmin: data.isAdmin === true,
        canManageMcpBinding: data.canManageMcpBinding === true,
        identityUserConnected: data.identityUserConnected,
        toolCallLogs: data.toolCallLogs,
      };
    }, [chatServiceEndpointUrl]);

  return { bootstrapSession };
};
