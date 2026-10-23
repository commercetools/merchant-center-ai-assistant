/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Scheme + host (+ port) of an https URL; independent of a trailing /service. */
export function originOf(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`expected an https URL, got ${parsed.protocol.replace(':', '')}`);
  }
  return parsed.origin;
}

/** URL of the `service` application, or undefined while Connect has not assigned one. */
export function serviceUrlFrom(deployment) {
  const app = (deployment?.applications ?? []).find((a) => a?.applicationName === 'service');
  const url = app?.url;
  return typeof url === 'string' && url.trim() !== '' ? url : undefined;
}

/** `{applicationName, url}` of the three Merchant Center applications that have a URL. */
export function mcApplicationUrls(deployment) {
  const wanted = ['mc-app', 'composed-apps', 'mc-view-app'];
  return wanted.map((name) => {
    const app = (deployment?.applications ?? []).find((a) => a?.applicationName === name);
    return { applicationName: name, url: app?.url ?? '' };
  });
}

export function connectApiHost(region) {
  return `https://connect.${region}.commercetools.com`;
}

export function authHost(region) {
  return `https://auth.${region}.commercetools.com`;
}
