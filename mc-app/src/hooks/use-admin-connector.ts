/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useMemo } from 'react';
import type {
  BackofficeThreadsFilters,
  GetBackofficeThreadMessagesResponse,
  GetBackofficeThreadsResponse,
  GetFeedbackEntriesResponse,
  GetFeedbackEntryResponse,
  GetMcpProvidersResponse,
  GetSystemPromptConfigResponse,
  SetSystemPromptConfigResponse,
} from './admin-types';
import { useServiceRequest } from './use-chat-service-connector/request';

/**
 * Service methods behind the admin surfaces: MCP provider status, system prompt,
 * backoffice threads and feedback review.
 *
 * Same transport as the chat connector (the Merchant Center gateway vouches for the
 * signed-in user), same rules: no e-mail, no project key and no admin header is ever sent.
 * Whether the caller is an administrator is decided by the service from the verified user
 * id. `system-prompt` PUT, `backoffice/*` and `feedback/fetch*` answer 403 `ADMIN_REQUIRED`
 * to everyone else; the error reaches the caller unchanged (see `utils/admin-error.ts`).
 * `GET mcp/providers` is open to every member: it returns names and booleans only.
 */
export const useAdminConnector = () => {
  const request = useServiceRequest();

  /** Read-only provider status. Provider credentials are Connect configuration. */
  const getMCPProviders = useCallback(
    () => request<GetMcpProvidersResponse>('GET', 'mcp/providers'),
    [request]
  );

  const getSystemPromptConfig = useCallback(
    () => request<GetSystemPromptConfigResponse>('GET', 'system-prompt'),
    [request]
  );

  const setSystemPromptConfig = useCallback(
    (systemPrompt: string) =>
      request<SetSystemPromptConfigResponse>('PUT', 'system-prompt', {
        systemPrompt,
      }),
    [request]
  );

  const getBackofficeThreads = useCallback(
    (
      filters: BackofficeThreadsFilters,
      limit: number = 10,
      offset: number = 0
    ) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      return request<GetBackofficeThreadsResponse>(
        'POST',
        `backoffice/threads?${params.toString()}`,
        { filters }
      );
    },
    [request]
  );

  const getBackofficeThreadMessages = useCallback(
    (sessionId: string) =>
      request<GetBackofficeThreadMessagesResponse>(
        'GET',
        `backoffice/threads/${encodeURIComponent(sessionId)}`
      ),
    [request]
  );

  /** Metadata only: the list never carries a transcript. */
  const getFeedbackEntries = useCallback(
    (limit: number = 20, offset: number = 0, authorUserId?: string) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (authorUserId) params.append('authorUserId', authorUserId);
      return request<GetFeedbackEntriesResponse>(
        'GET',
        `feedback/fetch?${params.toString()}`
      );
    },
    [request]
  );

  /** One entry including the reassembled snapshot. */
  const getFeedbackEntry = useCallback(
    (feedbackId: string) =>
      request<GetFeedbackEntryResponse>(
        'GET',
        `feedback/fetch/${encodeURIComponent(feedbackId)}`
      ),
    [request]
  );

  return useMemo(
    () => ({
      getMCPProviders,
      getSystemPromptConfig,
      setSystemPromptConfig,
      getBackofficeThreads,
      getBackofficeThreadMessages,
      getFeedbackEntries,
      getFeedbackEntry,
    }),
    [
      getMCPProviders,
      getSystemPromptConfig,
      setSystemPromptConfig,
      getBackofficeThreads,
      getBackofficeThreadMessages,
      getFeedbackEntries,
      getFeedbackEntry,
    ]
  );
};
