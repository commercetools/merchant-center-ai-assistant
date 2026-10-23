/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useMemo } from 'react';
import { isForwardToError } from '../../utils/forward-to';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  DeleteSessionResponse,
  GetAllSessionsSummaryResponse,
  GetMessagesResponse,
  GetSessionDigestResponse,
  GetSessionResponse,
  GetSessionToolsResponse,
  GetSuggestionsResponse,
  GetToolCallLogsConfigResponse,
  GroupedSessionTools,
  SetToolCallLogsConfigResponse,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
  ToolCallLogsMode,
  UpdateSessionRequest,
  UpdateSessionResponse,
  UpdateSessionToolsResponse,
} from './types';
import { useServiceRequest } from './request';

/**
 * Chat service methods (sessions, messages, tools, digest, suggestions, tool-call-logs,
 * feedback).
 *
 * Every call goes through the Merchant Center gateway (`utils/forward-to.ts`), which
 * vouches for the signed-in user and project. The browser never sends an identity of its
 * own: no e-mail in the URL or the headers. The only user-derived value that ever leaves
 * here is the display-only `userLabel` in a JSON body (session creation, feedback).
 *
 * A non-ok answer throws a `ForwardToError` (see `request.ts`); `getMessages` is the one
 * place where a 404 is a normal answer.
 */
export const useChatServiceConnector = () => {
  const request = useServiceRequest();

  const createSession = useCallback(
    (body: CreateSessionRequest) =>
      request<CreateSessionResponse>('POST', 'session', body),
    [request]
  );

  /** The newest session of the caller. Throws (404) when there is none yet. */
  const getLastSession = useCallback(
    () => request<GetSessionResponse>('GET', 'session'),
    [request]
  );

  const getSession = useCallback(
    (sessionId: string) =>
      request<GetSessionResponse>('GET', `session/${sessionId}`),
    [request]
  );

  const updateSession = useCallback(
    (sessionId: string, body: UpdateSessionRequest) =>
      request<UpdateSessionResponse>('PUT', `session/${sessionId}`, body),
    [request]
  );

  /**
   * `notFound` is carried alongside the envelope because the caller has to tell "this
   * session is gone, fall back to the last one" from "the read failed, keep what we
   * have". Every other failure throws.
   */
  const getMessages = useCallback(
    async (
      sessionId: string,
      limit?: number,
      offset?: number
    ): Promise<GetMessagesResponse> => {
      const params = new URLSearchParams();
      if (limit) params.append('limit', String(limit));
      if (offset) params.append('offset', String(offset));
      const query = params.toString();
      try {
        const envelope = await request<GetMessagesResponse>(
          'GET',
          `session/${sessionId}/messages${query ? `?${query}` : ''}`
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

  const getSessionTools = useCallback(
    (sessionId: string) =>
      request<GetSessionToolsResponse>('GET', `session/${sessionId}/tools`),
    [request]
  );

  const updateSessionTools = useCallback(
    (sessionId: string, tools: GroupedSessionTools[]) =>
      request<UpdateSessionToolsResponse>('PUT', `session/${sessionId}/tools`, {
        tools,
      }),
    [request]
  );

  const getAllSessionsSummary = useCallback(
    () => request<GetAllSessionsSummaryResponse>('GET', 'session/all'),
    [request]
  );

  /**
   * Poll for a session's digest: the title, description, icon and follow-up prompts the
   * service writes AFTER the chat stream closes. `pending` is a normal answer.
   */
  const getSessionDigest = useCallback(
    (sessionId: string, since: number) =>
      request<GetSessionDigestResponse>(
        'GET',
        `session/${sessionId}/digest?since=${since}`
      ),
    [request]
  );

  /**
   * Opening prompts for the empty state. Always resolves with four cards: the service
   * answers 200 with static defaults when it cannot personalise.
   */
  const getSuggestions = useCallback(
    (locale: string) =>
      request<GetSuggestionsResponse>(
        'GET',
        `suggestions?locale=${encodeURIComponent(locale)}`
      ),
    [request]
  );

  const deleteSession = useCallback(
    (sessionId: string) =>
      request<DeleteSessionResponse>('DELETE', `session/${sessionId}`),
    [request]
  );

  const getToolCallLogsConfig = useCallback(
    () => request<GetToolCallLogsConfigResponse>('GET', 'tool-call-logs'),
    [request]
  );

  /** Admin-only on the service (403 `ADMIN_REQUIRED` for others); only Q's settings call it. */
  const setToolCallLogsConfig = useCallback(
    (mode: ToolCallLogsMode) =>
      request<SetToolCallLogsConfigResponse>('PUT', 'tool-call-logs', {
        mode,
      }),
    [request]
  );

  /**
   * Any authenticated user can file a report. Throws on failure (413, 502 and friends
   * included) with a `ForwardToError` whose message names the status, so the popup can
   * show a real cause instead of a JSON parse error.
   */
  const submitFeedback = useCallback(
    (body: SubmitFeedbackRequest) =>
      request<SubmitFeedbackResponse>('POST', 'feedback/submit', body),
    [request]
  );

  return useMemo(
    () => ({
      createSession,
      getSession,
      getLastSession,
      updateSession,
      deleteSession,
      getMessages,
      getSessionTools,
      updateSessionTools,
      getAllSessionsSummary,
      getSuggestions,
      getSessionDigest,
      getToolCallLogsConfig,
      setToolCallLogsConfig,
      submitFeedback,
    }),
    [
      createSession,
      getSession,
      getLastSession,
      updateSession,
      deleteSession,
      getMessages,
      getSessionTools,
      updateSessionTools,
      getAllSessionsSummary,
      getSuggestions,
      getSessionDigest,
      getToolCallLogsConfig,
      setToolCallLogsConfig,
      submitFeedback,
    ]
  );
};
