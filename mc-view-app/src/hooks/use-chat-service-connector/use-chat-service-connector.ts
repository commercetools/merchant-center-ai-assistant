/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/hooks/use-chat-service-connector/use-chat-service-connector.ts,
// pruned to what the panel calls: no tools, no tool-call-logs writes, no feedback.

import { useCallback, useMemo } from 'react';
import { isForwardToError } from '../../utils/forward-to';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetAllSessionsSummaryResponse,
  GetMessagesResponse,
  GetSessionDigestResponse,
  GetSessionResponse,
  GetSuggestionsResponse,
  GetToolCallLogsConfigResponse,
} from './types';
import { useServiceRequest } from './request';

/**
 * Chat service methods used by the panel. Every call goes through the Merchant Center
 * gateway and carries the `customView` flag (see `request.ts`); the browser never sends an
 * identity of its own.
 */
export const useChatServiceConnector = () => {
  const request = useServiceRequest();

  const createSession = useCallback(
    (body: CreateSessionRequest) =>
      request<CreateSessionResponse>('POST', 'session', body),
    [request]
  );

  /** The newest session of the caller for this host page. Throws (404) when none. */
  const getLastSession = useCallback(
    () => request<GetSessionResponse>('GET', 'session'),
    [request]
  );

  /** `notFound` tells a gone session from a failed read; every other failure throws. */
  const getMessages = useCallback(
    async (sessionId: string): Promise<GetMessagesResponse> => {
      try {
        const envelope = await request<GetMessagesResponse>(
          'GET',
          `session/${sessionId}/messages`
        );
        return { ...envelope, notFound: false };
      } catch (err) {
        if (isForwardToError(err) && err.status === 404) {
          return { success: false, data: [], notFound: true };
        }
        throw err;
      }
    },
    [request]
  );

  const getAllSessionsSummary = useCallback(
    () => request<GetAllSessionsSummaryResponse>('GET', 'session/all'),
    [request]
  );

  /** Poll for the digest (follow-up prompts). `pending` is a normal answer. */
  const getSessionDigest = useCallback(
    (sessionId: string, since: number) =>
      request<GetSessionDigestResponse>(
        'GET',
        `session/${sessionId}/digest?since=${since}`
      ),
    [request]
  );

  /** Opening prompts for the empty state; the service answers static defaults on failure. */
  const getSuggestions = useCallback(
    (locale: string) =>
      request<GetSuggestionsResponse>(
        'GET',
        `suggestions?locale=${encodeURIComponent(locale)}`
      ),
    [request]
  );

  /** Read only: the panel never changes the setting. */
  const getToolCallLogsConfig = useCallback(
    () => request<GetToolCallLogsConfigResponse>('GET', 'tool-call-logs'),
    [request]
  );

  return useMemo(
    () => ({
      createSession,
      getLastSession,
      getMessages,
      getAllSessionsSummary,
      getSessionDigest,
      getSuggestions,
      getToolCallLogsConfig,
    }),
    [
      createSession,
      getLastSession,
      getMessages,
      getAllSessionsSummary,
      getSessionDigest,
      getSuggestions,
      getToolCallLogsConfig,
    ]
  );
};
