/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** The one flag this panel sends: the host page URL, so the service scopes the session. */
export const CUSTOM_VIEW_FLAG = 'customView';

export type FeatureFlags = Record<string, string | boolean | undefined>;

/**
 * UTF-8 bytes -> base64. `btoa` alone throws on any character above Latin-1 (a product or
 * category slug in another script), which would blank the whole panel.
 */
export const encodeHostUrl = (url: string): string => {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

/** Appends every defined flag as a query parameter (percent-encoded by `URLSearchParams`). */
export const applyFeatureFlagsToUrl = (
  url: string,
  flags: FeatureFlags | undefined
): string => {
  if (!flags || Object.keys(flags).length === 0) return url;
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://default.invalid';
  const parsed = new URL(url, base);
  for (const [key, value] of Object.entries(flags)) {
    if (value !== undefined) parsed.searchParams.append(key, String(value));
  }
  return parsed.toString();
};
