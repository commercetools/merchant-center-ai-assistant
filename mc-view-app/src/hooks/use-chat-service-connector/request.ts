/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

// Derived from mc-app/src/hooks/use-chat-service-connector/request.ts: JSON requests here
// go through `useFetch` so the `customView` flag is appended to every URL.

import { useCallback } from 'react';
import { ForwardToError, forwardToFetch } from '../../utils/forward-to';
import { useFetch } from '../use-fetch';
import { useChatServiceEndpoint } from '../use-chat-service-endpoint';

export type ServiceRequest = <T>(
  method: string,
  path: string,
  body?: unknown
) => Promise<T>;

export type ServiceBlobRequest = (
  path: string,
  signal?: AbortSignal
) => Promise<Blob>;

const buildUrl = (endpoint: string | undefined, path: string): string => {
  if (!endpoint) {
    throw new Error('The chat service endpoint URL is not configured.');
  }
  return `${endpoint}${path.replace(/^\/+/, '')}`;
};

/**
 * Plain (non-hook) builders so the logic can be unit-tested without React.
 *
 * `path` is relative to the endpoint URL (which always ends in `/`), for example
 * `session/all`. A non-ok response throws a {@link ForwardToError}; callers that need to
 * treat a specific status as a normal answer (a 404 for a stale session id) catch it and
 * check `err.status`. `fetchFn` is the flag-aware fetch from `useFetch`.
 */
export const createServiceRequest =
  (endpoint: string | undefined, fetchFn: typeof fetch): ServiceRequest =>
  async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const uri = buildUrl(endpoint, path);
    const res = await fetchFn(uri, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ForwardToError(uri, res.status, text);
    }
    return (await res.json()) as T;
  };

/**
 * Private images are fetched with `forwardToFetch` directly (no flag): the bytes of a file
 * do not depend on the host page. Identical in mc-app.
 */
export const createServiceBlobRequest =
  (endpoint: string | undefined): ServiceBlobRequest =>
  async (path: string, signal?: AbortSignal): Promise<Blob> => {
    const uri = buildUrl(endpoint, path);
    const res = await forwardToFetch(uri, {
      method: 'GET',
      headers: { accept: 'image/*' },
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ForwardToError(uri, res.status, text);
    }
    return res.blob();
  };

/** JSON request helper bound to the configured chat service endpoint, flag included. */
export const useServiceRequest = (): ServiceRequest => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  const fetchWithFlags = useFetch();
  return useCallback<ServiceRequest>(
    (method, path, body) =>
      createServiceRequest(chatServiceEndpointUrl, fetchWithFlags)(
        method,
        path,
        body
      ),
    [chatServiceEndpointUrl, fetchWithFlags]
  );
};

/** Binary (image) request helper bound to the configured chat service endpoint. */
export const useServiceBlobRequest = (): ServiceBlobRequest => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  return useCallback<ServiceBlobRequest>(
    (path, signal) =>
      createServiceBlobRequest(chatServiceEndpointUrl)(path, signal),
    [chatServiceEndpointUrl]
  );
};
