/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Host helpers for the commercetools API region spelling (`us-central1.gcp`), which is what
 * `ctp.region` holds. `commercetools.com` is the only domain supported.
 */

/** `https://mcp.{region}.commercetools.com/projects/{projectKey}/{serverKey}` */
export const managedMcpUrl = (
  apiRegion: string,
  projectKey: string,
  serverKey: string
): string =>
  `https://mcp.${apiRegion}.commercetools.com/projects/${projectKey}/${serverKey}`;

/**
 * The identity-mode authorization server, e.g. `https://auth2.us-central1.gcp.commercetools.com`.
 * Not the client-credentials host `auth.{region}` and not the upstream `auth.identity` IdP.
 */
export const auth2Url = (apiRegion: string): string =>
  `https://auth2.${apiRegion}.commercetools.com`;

/**
 * Whether a host is a commercetools authorization server we log about. The origin comparison
 * against `auth2Url(region)` is what actually blocks a foreign server.
 */
export const isCommercetoolsAuthHost = (host: string): boolean =>
  /^auth2?\.[a-z0-9-]+\.[a-z0-9-]+\.commercetools\.com$/.test(host) ||
  host === 'auth.identity.commercetools.com';
