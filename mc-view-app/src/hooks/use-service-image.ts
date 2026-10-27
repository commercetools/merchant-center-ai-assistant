/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  createServiceBlobRequest,
  type ServiceBlobRequest,
} from './use-chat-service-connector/request';
import { useChatServiceEndpoint } from './use-chat-service-endpoint';

export type ServiceImageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; objectUrl: string }
  | { status: 'error' };

export const SERVICE_FILE_PREFIX = '/files/';

/** Concurrent identical requests share one fetch; the entry is removed when it settles. */
const inFlight = new Map<string, Promise<Blob>>();

// The shared request carries no abort signal on purpose: callers that unmount just ignore
// the result. Aborting it for one caller (React StrictMode mounts effects twice) would fail
// the other caller waiting on the same promise.
const fetchBlobOnce = (
  requestBlob: ServiceBlobRequest,
  path: string
): Promise<Blob> => {
  const existing = inFlight.get(path);
  if (existing) return existing;
  const promise = requestBlob(path).finally(() => {
    inFlight.delete(path);
  });
  inFlight.set(path, promise);
  return promise;
};

/**
 * Loads a private, service-relative image (`/files/<sessionId>/<file>`) through the
 * Merchant Center gateway and exposes it as an object URL.
 *
 * A plain `<img src>` cannot carry the gateway token, and a relative path would hit the
 * Merchant Center origin instead of the service, so the bytes are fetched with
 * `forwardToFetch` and shown from `URL.createObjectURL`. The object URL is created and
 * revoked by the same effect run, so React StrictMode's double mount never leaves a dead
 * URL in state. Nothing is cached across mounts.
 *
 * Any `url` that does not start with `/files/` yields `idle` (the caller renders it some
 * other way or not at all).
 */
export const useServiceImage = (
  url?: string
): ServiceImageState & { retry: () => void } => {
  const { chatServiceEndpointUrl } = useChatServiceEndpoint();
  const [state, setState] = useState<ServiceImageState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url || !url.startsWith(SERVICE_FILE_PREFIX)) {
      setState({ status: 'idle' });
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl: string | undefined;
    setState({ status: 'loading' });

    const requestBlob = createServiceBlobRequest(chatServiceEndpointUrl);
    // `/files/<sid>/<file>` -> `files/<sid>/<file>`, relative to the endpoint URL.
    fetchBlobOnce(requestBlob, url.slice(1))
      .then((blob) => {
        if (controller.signal.aborted) return;
        if (!blob.type.startsWith('image/')) {
          setState({ status: 'error' });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, attempt, chatServiceEndpointUrl]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
};
