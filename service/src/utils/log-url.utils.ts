/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { Request } from 'express';

/**
 * Request URLs that are safe to log.
 *
 * `req.originalUrl` is logged in four places - the `LOG_HTTP` tracer in `app.ts` and all
 * three branches of `middleware/error.middleware.ts` - and the identity-mode OAuth callback
 * arrives as `GET /service/managed-mcp-identity/callback?code=...&state=...`. So without
 * this, an authorization code lands in the log verbatim.
 *
 * That is not theoretical. If the callback route is unreachable, the authorize popup
 * completes against a 404 and `errorMiddleware` writes the full URL - including the code -
 * to the log. These logs get pasted into issues and chat transcripts, which is a channel
 * the code should never reach.
 *
 * An authorization code is single-use and short-lived, but it is single-use only because
 * the authorization server says so: a code that leaks before it is redeemed can be
 * redeemed by whoever read it. PKCE bounds the damage (the attacker also needs the
 * verifier, which is encrypted at rest) but defence in depth is the point.
 */

/**
 * Query parameters whose values must never be logged.
 *
 * `state` is included even though it is not itself a secret: it is the router's
 * single-use binder for the callback, and logging it invites a replay attempt from
 * whoever reads the log.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'code_verifier',
  'assertion',
]);

/** What a redacted value is replaced with. Keeps the length, which is often diagnostic. */
const redactedMarker = (value: string) => `[redacted:${value.length}]`;

/**
 * `url` with every sensitive query-parameter value replaced.
 *
 * Path and non-sensitive parameters are preserved, so the line still identifies the route
 * and carries the diagnostics that matter (`error`, `error_description`, `iss`).
 *
 * Falls back to the path alone if the URL cannot be parsed - a malformed URL is exactly
 * the case where blindly returning the input would leak it.
 */
export const sanitizeUrlForLog = (url: string): string => {
  const queryStart = url.indexOf('?');

  if (queryStart === -1) {
    return url;
  }

  const path = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1);

  try {
    const params = new URLSearchParams(query);
    let touched = false;

    for (const key of Array.from(params.keys())) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        const value = params.get(key) ?? '';
        params.set(key, redactedMarker(value));
        touched = true;
      }
    }

    if (!touched) {
      return url;
    }

    // `URLSearchParams.toString()` percent-encodes the marker's brackets and colon, which
    // makes the line harder to read for no benefit. Decode just those.
    const rebuilt = params
      .toString()
      .replace(/%5Bredacted%3A(\d+)%5D/g, '[redacted:$1]');

    return `${path}?${rebuilt}`;
  } catch {
    return `${path}?[unparseable-query-redacted]`;
  }
};

/** {@link sanitizeUrlForLog} applied to a request's `originalUrl`. */
export const requestUrlForLog = (req: Request): string =>
  sanitizeUrlForLog(req.originalUrl ?? req.url ?? '');
