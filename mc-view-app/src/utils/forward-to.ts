/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  buildApiUrl,
  executeHttpClientRequest,
} from '@commercetools-frontend/application-shell-connectors';

/**
 * Every browser -> chat-service request goes through the Merchant Center API's
 * `/proxy/forward-to` gateway.
 *
 * The gateway authenticates the user's Merchant Center session (cookie in production, the
 * dev session token under `mc-scripts start`), mints a short-lived asymmetrically signed
 * JWT bound to `origin + path` of the forwarded URI, and calls the router with it. The
 * router verifies that JWT against the gateway's JWKS on every request. No router
 * credential ever lives in the browser: there is no bearer to store, refresh or leak.
 *
 * DUPLICATED, deliberately. This file exists in mc-app, mc-view-app and composed-apps.
 * The three packages are deployed independently - separate `yarn.lock`, separate
 * `node_modules`, no root manifest and no `paths` in any tsconfig - so there is no shared
 * build to hang a module off, and standing one up to share sixty lines would cost three
 * lockfile regenerations and a build step. Keep the copies in sync by hand; if they ever
 * need to diverge, say why in the copy that diverges.
 */

/**
 * Headers that belong to the gateway hop and are never relayed to the router.
 *
 * `content-type` describes the body the GATEWAY receives, so it is set on the outer
 * request only (app-kit's own Apollo forward-to link does the same for GraphQL bodies).
 * Relaying it as well would put two `content-type` headers on the router hop, and
 * body-parser refuses a comma-joined media type - the exact failure the old
 * `routerTransportHeaders` helper existed to avoid.
 */
const NOT_RELAYED = new Set(['authorization', 'content-type']);

export const toUri = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : String(input);

/**
 * NEVER put a query string on the gateway URL - not even a bare `?`.
 *
 * The temptation is real, so here is the whole trap. Chrome's HTTP cache takes a
 * single-writer lock per cache key, and the cache key is URL + method. Every call in this
 * app goes to the one URL below, so concurrent GETs run strictly one at a time, each
 * waiting out everything queued ahead of it: eight bootstrap GETs of ~400ms each took 3.3s
 * wall-clock, with `blocked` on each equal to the cumulative total of its predecessors.
 * (The POSTs were unaffected - a POST is not cacheable, so it takes no lock.) Making the
 * URL unique per endpoint fixes that, and it is the obvious move.
 *
 * It does not work here. The Merchant Center gateway answers a preflight by extending
 * `Access-Control-Allow-Headers` with whatever `x-forward-header-*` it sees in
 * `Access-Control-Request-Headers` - and it only does so when the path is EXACTLY
 * `/proxy/forward-to`. Add any query string and the response falls back to its static
 * allowlist, which contains no `x-forward-header-*` at all. Since `relayed` below always
 * sends at least `accept`, every request then fails preflight with "Request header field
 * x-forward-header-accept is not allowed by Access-Control-Allow-Headers". Measured
 * against mc-api directly: `/proxy/forward-to` echoes the relay headers back, while
 * `/proxy/forward-to?ft=...`, `?foo=1` and even `?` do not.
 *
 * `cache: 'no-store'` below is therefore the fix, and it is sufficient on its own - it
 * keeps the request out of the HTTP cache entirely, so there is no entry to lock. Measured
 * in Chrome, eight concurrent GETs against a 400ms endpoint: 3230ms shared-URL cached vs
 * 810ms with `no-store`, identical to what the unique-URL version achieved.
 */

/**
 * `typeof fetch`, so it drops into `DefaultChatTransport({ fetch })` and every connector
 * call unchanged.
 *
 * `input` is the ROUTER url, query string included - the gateway forwards it verbatim.
 * The browser actually calls `${mcApiUrl}/proxy/forward-to`, with no query string of its
 * own - see the note above on why that is not negotiable.
 *
 * Every header the caller passes is meant for the router, so it is relayed as
 * `x-forward-header-<name>` (the gateway strips the prefix), except the ones in
 * {@link NOT_RELAYED}. `accept` defaults to JSON like the bootstrap call always did.
 *
 * A 401 from the gateway (lapsed Merchant Center session) is retried once by
 * `executeHttpClientRequest` with `X-Force-Token`. If the retry is also a 401 the
 * `Response` is handed back the way `fetch` would, so `res.ok` / `res.json()` call sites
 * keep working. A router 401 costs one extra request, which is acceptable.
 *
 * `data: res` returns the untouched `Response`, so a streaming body is read incrementally
 * by the caller, and `init.signal` is forwarded so aborting still cancels the request.
 */
const forwardToGatewayFetch: typeof fetch = async (input, init = {}) => {
  const uri = toUri(input);
  const method = (init.method ?? 'GET').toUpperCase();
  const hasBody = init.body !== undefined && init.body !== null;

  // Lower-case keys so a caller's `Accept` and our default never become two keys.
  //
  // Keep this set minimal. Each entry is relayed as `x-forward-header-<name>`, and the
  // gateway only allows those through CORS preflight by echoing them back - see the URL
  // rule above. A tunnel- or host-specific opt-out header does not belong here: it would
  // ship to production for every user to work around one developer's local setup.
  const relayed: Record<string, string> = {
    accept: 'application/json',
  };
  new Headers(init.headers).forEach((value, name) => {
    if (!NOT_RELAYED.has(name)) relayed[name] = value;
  });

  let unauthorized: Response | undefined;
  try {
    return await executeHttpClientRequest<Response>(
      async (options) => {
        const res = await fetch(buildApiUrl('/proxy/forward-to'), {
          ...options, // credentials: 'include' + the gateway headers
          method,
          // Load-bearing, see the note above the URL rule. Nothing here is ever cacheable
          // (the router answers `no-store` on every route), so the HTTP cache contributes
          // nothing but the per-key lock that made the bootstrap serial.
          cache: 'no-store',
          headers: {
            ...options.headers,
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          },
          body: init.body,
          signal: init.signal,
        });
        if (res.status === 401) unauthorized = res;
        return {
          data: res,
          statusCode: res.status,
          getHeader: (name: string) => res.headers.get(name),
        };
      },
      {
        forwardToConfig: {
          uri,
          // The router verifies `MC_AUDIENCE + request path`, so the path of `uri` is
          // part of the audience. Must match the router's `audiencePolicy`.
          audiencePolicy: 'forward-url-full-path',
          headers: relayed,
        },
      }
    );
  } catch (err) {
    if (
      unauthorized &&
      err instanceof Error &&
      err.name === 'RenewTokenError'
    ) {
      return unauthorized;
    }
    throw err;
  }
};

/**
 * The gateway only reaches public https URLs, so under `mc-scripts start` (`window.app.env`
 * is `development`) an `http://` service - in practice the local one - is called directly.
 * The service must run with `MC_AUTH_DISABLED=true`: there is no gateway JWT on this path.
 */
export const isDirectServiceUri = (uri: string): boolean =>
  (window as { app?: { env?: string } }).app?.env === 'development' &&
  new URL(uri).protocol === 'http:';

/**
 * Drop-in replacement for the gateway call: same signature, but development with an
 * `http://` service skips `/proxy/forward-to` and fetches the service itself. The headers
 * go out as given (no `x-forward-header-` relay); `accept` and, for a string body, `content-type` default to JSON.
 */
export const forwardToFetch: typeof fetch = (input, init = {}) => {
  const uri = toUri(input);
  if (!isDirectServiceUri(uri)) return forwardToGatewayFetch(input, init);
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  // The gateway hop sets this on the outer request; direct, the service's JSON parser
  // skips a body that arrives without it and every field reads as missing.
  if (typeof init.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(uri, { ...init, headers, cache: 'no-store' });
};

/**
 * What {@link forwardToJson} throws for a non-ok response.
 *
 * The message is the human-readable line callers always got. `status` is there so a caller
 * can tell a lapsed Merchant Center session (the gateway's 401, after its own forced-token
 * retry) from a router or network failure without parsing that line - the two need
 * different remedies (sign in again vs. retry), and the session gate shows different copy.
 */
export class ForwardToError extends Error {
  readonly status: number;
  /** Raw response body, untruncated. */
  readonly body: string;

  constructor(uri: string, status: number, body: string) {
    super(
      `Request to ${new URL(uri).pathname} failed (${status}). ${body.slice(
        0,
        200
      )}`
    );
    this.name = 'ForwardToError';
    this.status = status;
    this.body = body;
  }
}

export const isForwardToError = (err: unknown): err is ForwardToError =>
  err instanceof ForwardToError;

/**
 * JSON convenience: throws a {@link ForwardToError} with status and a body excerpt on
 * `!ok`, the way the session bootstrap always reported failures.
 */
export const forwardToJson = async <T>(
  uri: string,
  init?: RequestInit
): Promise<T> => {
  const res = await forwardToFetch(uri, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ForwardToError(uri, res.status, text);
  }
  return (await res.json()) as T;
};
