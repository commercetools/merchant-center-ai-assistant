/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Telling "the Merchant Center refused this for lack of permission" apart from every other
 * failure.
 *
 * Worth a helper because the two clients this app talks to report the SAME refusal in
 * completely different shapes:
 *
 *   - `@commercetools-frontend/sdk` (`useAsyncDispatch`, the `/proxy/ctp` REST proxy) rejects
 *     with the http middleware's error object: `statusCode`, `status` and `code` all carry
 *     the HTTP status, `message` is the body's message, and `body` is the parsed response -
 *     `{ error: 'insufficient_scope', errors: [{ code: 'insufficient_scope' }], ... }`.
 *   - Apollo (`useMcQuery` / `useMcMutation`) rejects with an `ApolloError`, where the same
 *     refusal arrives either as a `networkError` carrying the response body under `result`,
 *     or as a row in `graphQLErrors`.
 *
 * Narrowing both here, once, keeps the question at the call sites to the one they care
 * about: is this "you are not allowed to do this" - in which case the user needs to know
 * which permission to ask for, and from whom - or a genuine failure to report.
 */

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;

/**
 * Every object inside a rejection that could carry the refusal, flattened.
 *
 * Depth-limited rather than exhaustive: the shapes above nest three levels at most
 * (`error.networkError.result.errors[0]`), and an error object can hold cyclic references -
 * `originalRequest` on the sdk error does.
 */
const errorNodes = (value: unknown, depth = 0): UnknownRecord[] => {
  const record = asRecord(value);
  if (!record || depth > 3) return [];

  const nested = [
    record.body,
    record.networkError,
    record.result,
    record.extensions,
    ...(Array.isArray(record.errors) ? record.errors : []),
    ...(Array.isArray(record.graphQLErrors) ? record.graphQLErrors : []),
  ];

  return [record, ...nested.flatMap((child) => errorNodes(child, depth + 1))];
};

/** The string fields any of these clients puts the reason in. */
const REASON_FIELDS = [
  'error',
  'code',
  'message',
  'error_description',
] as const;

const saysInsufficientScope = (record: UnknownRecord): boolean => {
  // The sdk error's `code` is the numeric status, not an error code - so the status is read
  // from all three of the fields it sets, and only strings are pattern-matched below.
  if (record.statusCode === 403 || record.status === 403) return true;

  return REASON_FIELDS.some((field) => {
    const value = record[field];
    return typeof value === 'string' && /insufficient[_ ]scope/i.test(value);
  });
};

/**
 * Was this rejection the Merchant Center declining for lack of permission?
 *
 * A bare 403 counts: the MC API answers one for exactly this reason, and the alternative -
 * insisting on the `insufficient_scope` marker - would misreport as an unexplained error the
 * case this exists to explain.
 */
export const isInsufficientPermissionError = (error: unknown): boolean =>
  errorNodes(error).some(saysInsufficientScope);

/*
 * "Insufficient scope. One of the following scopes is missing: view_mcp_servers:my-project,
 * manage_project:my-project"
 *
 * Stops at a sentence-ending period; neither an OAuth scope nor a project key contains one.
 */
const MISSING_SCOPES_PATTERN = /scopes? (?:is|are) missing:\s*([^.]+)/i;

/**
 * The scopes the response named as missing, e.g. `view_mcp_servers:my-project`.
 *
 * Shown to the user verbatim. They cannot act on a scope name directly - scopes are granted
 * through permission groups, not one by one - but it is what an administrator needs to work
 * out which group to grant, and it is the only part of the message that is specific.
 *
 * Empty when the refusal named none, which callers must handle: the surrounding advice has
 * to stand on its own.
 */
export const missingScopesFromError = (error: unknown): string[] => {
  for (const record of errorNodes(error)) {
    for (const field of ['message', 'error_description'] as const) {
      const value = record[field];
      if (typeof value !== 'string') continue;

      const match = value.match(MISSING_SCOPES_PATTERN);
      if (match) {
        return Array.from(
          new Set(
            match[1]
              .split(',')
              .map((scope) => scope.trim())
              .filter(Boolean)
          )
        );
      }
    }
  }

  return [];
};
