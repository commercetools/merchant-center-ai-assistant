/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** How long a per-user tool set is reused (a snapshot of the user's MC permissions). */
export const IDENTITY_TOOLS_TTL_MS = 60_000;
/** Lifetime of one PKCE attempt. */
export const AUTH_STATE_TTL_MS = 10 * 60_000;
export const SERVER_KEY_PATTERN = /^[A-Za-z0-9_-]{2,256}$/;
/** Pre-flight and revocation requests never wait longer than this. */
export const SHORT_FETCH_TIMEOUT_MS = 5_000;
/** `window.postMessage` type the frontend listens for. */
export const OAUTH_MESSAGE_TYPE = 'ct-identity-mcp-oauth';
/** Registry key, menu group id and `disabledTools` key of the source. */
export const COMMERCETOOLS_SOURCE_NAME = 'commercetools';
/** A Merchant Center user id is a UUID (hex plus hyphens); it reaches cache keys and logs. */
export const IDENTITY_USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
