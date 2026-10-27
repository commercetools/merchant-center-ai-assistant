/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback } from 'react';
import { forwardToFetch } from '../../utils/forward-to';
import { useChatServiceEndpoint } from '../use-chat-service-endpoint';

export type IdentityMcpStatus = {
  configured: boolean;
  connected: boolean;
  scope?: string;
  accessTokenExpiresAt?: string;
};

type Envelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const POPUP_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Per-user identity MCP connection for the Custom View.
 *
 * Binding is done in the AI Assistant application; this surface only lets the signed-in
 * user connect their own Merchant Center account (status, authorize, verify). It calls
 * `forwardToFetch` directly: these routes are not scoped to a host page, so no
 * `customView` flag belongs on them.
 */
export const useIdentityMcpConfig = () => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();

  const request = useCallback(
    async <T>(
      method: string,
      path = '',
      body?: unknown
    ): Promise<Envelope<T>> => {
      const endpoint = `${chatServiceEndpointUrl}managed-mcp-identity${path}`;
      const response = await forwardToFetch(endpoint, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const text = await response.text().catch(() => '');
      let envelope: Envelope<T> | undefined;
      try {
        envelope = JSON.parse(text) as Envelope<T>;
      } catch {
        // Keep the status-based fallback below.
      }

      if (!response.ok) {
        throw new Error(
          envelope?.error || `Identity MCP request failed (${response.status})`
        );
      }

      if (!envelope) {
        throw new Error('Identity MCP returned an invalid response');
      }
      return envelope;
    },
    [chatServiceEndpointUrl]
  );

  const fetchStatus = useCallback(async () => {
    const result = await request<IdentityMcpStatus>('GET', '/status');
    if (!result.data) throw new Error('Identity MCP status was not returned');
    return result.data;
  }, [request]);

  const connectUser = useCallback(async (): Promise<IdentityMcpStatus> => {
    if (!chatServiceEndpointUrl) {
      throw new Error('chatServiceEndpointUrl is not configured');
    }
    const result = await request<{
      connected: boolean;
      authorizationUrl?: string;
    }>('POST', '/authorize');

    if (result.data?.connected) return fetchStatus();
    const authorizationUrl = result.data?.authorizationUrl;
    if (!authorizationUrl) {
      throw new Error('The chat service did not return an authorization URL');
    }

    const popup = window.open(
      authorizationUrl,
      'ct-identity-mcp-oauth',
      'popup,width=640,height=760'
    );
    if (!popup) {
      throw new Error('The sign-in popup was blocked by the browser');
    }

    const expectedOrigin = new URL(chatServiceEndpointUrl).origin;
    const startedAt = Date.now();

    return new Promise<IdentityMcpStatus>((resolve, reject) => {
      let settled = false;
      // Assigned below, once the listener and the interval exist.
      let cleanup: () => void = () => undefined;

      const finishFromStatus = async () => {
        try {
          const status = await fetchStatus();
          if (status.connected) {
            cleanup();
            resolve(status);
            return true;
          }
        } catch {
          // The callback may still be exchanging the code; the next poll retries.
        }
        return false;
      };

      const onMessage = (event: MessageEvent) => {
        if (
          event.origin !== expectedOrigin ||
          event.data?.type !== 'ct-identity-mcp-oauth'
        ) {
          return;
        }
        if (event.data.success) {
          void finishFromStatus();
        } else {
          cleanup();
          reject(new Error(event.data.message || 'Identity sign-in failed'));
        }
      };

      window.addEventListener('message', onMessage);
      const poll: number = window.setInterval(() => {
        if (settled) return;
        if (Date.now() - startedAt >= POPUP_TIMEOUT_MS) {
          cleanup();
          popup.close();
          reject(new Error('Identity sign-in timed out'));
          return;
        }

        void finishFromStatus().then((connected) => {
          if (!connected && popup.closed) {
            cleanup();
            reject(
              new Error('Identity sign-in was closed before it completed')
            );
          }
        });
      }, 1000);
      cleanup = () => {
        settled = true;
        window.removeEventListener('message', onMessage);
        window.clearInterval(poll);
      };
    });
  }, [chatServiceEndpointUrl, fetchStatus, request]);

  const verifyUser = useCallback(async () => {
    await request('POST', '/verify');
  }, [request]);

  return { fetchStatus, connectUser, verifyUser };
};
