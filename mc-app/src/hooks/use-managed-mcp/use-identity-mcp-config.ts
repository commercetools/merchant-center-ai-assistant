/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback } from 'react';
import { ServiceRequestError } from '../../utils/admin-error';
import { forwardToFetch } from '../../utils/forward-to';
import { useChatServiceEndpoint } from '../use-chat-service-endpoint';
import type {
  IdentityMcpBinding,
  IdentityMcpStatus,
  IdentityMcpVerification,
} from './types';

type Envelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

const POPUP_TIMEOUT_MS = 10 * 60 * 1000;

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

      if (response.status === 404 && path === '' && method === 'GET') {
        return (await response.json()) as Envelope<T>;
      }

      const text = await response.text().catch(() => '');
      let envelope: Envelope<T> | undefined;
      try {
        envelope = JSON.parse(text) as Envelope<T>;
      } catch {
        // Keep the status-based fallback below.
      }

      if (!response.ok) {
        throw new ServiceRequestError(
          envelope?.error || `Identity MCP request failed (${response.status})`,
          response.status,
          envelope?.code
        );
      }

      if (!envelope) {
        throw new Error('Identity MCP returned an invalid response');
      }
      return envelope;
    },
    [chatServiceEndpointUrl]
  );

  const fetchBinding = useCallback(async () => {
    const result = await request<IdentityMcpBinding>('GET');
    return result.success ? result.data ?? null : null;
  }, [request]);

  const saveBinding = useCallback(
    async (binding: {
      serverKey: string;
      url: string;
      majorVersion: string;
    }) => {
      const result = await request<IdentityMcpBinding>('PUT', '', binding);
      if (!result.data)
        throw new Error('Identity MCP binding was not returned');
      return result.data;
    },
    [request]
  );

  const removeBinding = useCallback(
    async () => void (await request('DELETE')),
    [request]
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
      // Filled in below; `cleanup` runs later than both assignments.
      const handles: {
        onMessage?: (event: MessageEvent) => void;
        poll?: number;
      } = {};

      const cleanup = () => {
        settled = true;
        if (handles.onMessage) {
          window.removeEventListener('message', handles.onMessage);
        }
        window.clearInterval(handles.poll);
      };

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

      handles.onMessage = onMessage;
      window.addEventListener('message', onMessage);
      handles.poll = window.setInterval(() => {
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
    });
  }, [chatServiceEndpointUrl, fetchStatus, request]);

  const verifyUser = useCallback(async () => {
    const result = await request<IdentityMcpVerification>('POST', '/verify');
    if (!result.data)
      throw new Error('Identity MCP verification was not returned');
    return result.data;
  }, [request]);

  const disconnectUser = useCallback(
    async () => void (await request('DELETE', '/me')),
    [request]
  );

  return {
    fetchBinding,
    saveBinding,
    removeBinding,
    fetchStatus,
    connectUser,
    verifyUser,
    disconnectUser,
  };
};
