/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback } from 'react';
import {
  ForwardToError,
  forwardToFetch,
  forwardToJson,
} from '../../utils/forward-to';
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
 * check `err.status`.
 */
export const createServiceRequest =
  (endpoint: string | undefined): ServiceRequest =>
  <T>(method: string, path: string, body?: unknown): Promise<T> =>
    forwardToJson<T>(buildUrl(endpoint, path), {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

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

/** JSON request helper bound to the configured chat service endpoint. */
export const useServiceRequest = (): ServiceRequest => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  return useCallback<ServiceRequest>(
    (method, path, body) =>
      createServiceRequest(chatServiceEndpointUrl)(method, path, body),
    [chatServiceEndpointUrl]
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
