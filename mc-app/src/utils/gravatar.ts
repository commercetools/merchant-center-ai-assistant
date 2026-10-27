/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { useEffect, useState } from 'react';

/**
 * Gravatar keys an avatar on a hash of the email address.
 *
 * It accepted only MD5 for years and still does, but it has taken SHA-256 since 2024 - which
 * is what makes this possible without a dependency: `crypto.subtle` is the only hash the
 * browser offers and it does not implement MD5. `crypto.subtle` needs a secure context;
 * https and localhost both qualify, so the Merchant Center and `mc-scripts start` are covered.
 *
 * `d=404` is load-bearing: it tells Gravatar to 404 rather than serve a generated placeholder
 * when the address has no avatar, so the `<img>` errors and Nimbus `Avatar` keeps showing the
 * initials it had already rendered underneath.
 *
 * This sends a hash of the signed-in user's email address to gravatar.com. That is a
 * third-party request carrying an identifier, and it happens because it was asked for.
 */
const GRAVATAR_AVATAR_URL = 'https://www.gravatar.com/avatar';

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Keyed by `email|size` and module-level on purpose: a transcript renders one `UserAvatar`
 * per user message, and they all resolve to the same URL. Without this each mount would run
 * its own digest and hold its own promise.
 */
const urlCache = new Map<string, Promise<string | undefined>>();

const resolveGravatarUrl = (
  email: string,
  size: number
): Promise<string | undefined> => {
  const normalized = email.trim().toLowerCase();

  // The chat surface falls back to the literal string `anonymous` when the Merchant Center
  // session has no email. Hashing that would be a pointless request to a third party.
  if (!normalized.includes('@') || !globalThis.crypto?.subtle) {
    return Promise.resolve(undefined);
  }

  const cacheKey = `${normalized}|${size}`;
  const cached = urlCache.get(cacheKey);
  if (cached) return cached;

  const pending = sha256Hex(normalized)
    .then((hash) => `${GRAVATAR_AVATAR_URL}/${hash}?s=${size}&d=404`)
    .catch(() => undefined);
  urlCache.set(cacheKey, pending);
  return pending;
};

/**
 * The Gravatar URL for `email`, or `undefined` while it is being derived and for any address
 * that cannot have one. Callers pass it straight to `Avatar`'s `src`, which treats
 * `undefined` as "no image" and shows the initials.
 *
 * @param size pixels; ask for 2x the rendered box so it stays sharp on a retina display.
 */
export const useGravatarUrl = (
  email?: string | null,
  size = 64
): string | undefined => {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!email) {
      setUrl(undefined);
      return;
    }
    let isCurrent = true;
    resolveGravatarUrl(email, size).then((resolved) => {
      if (isCurrent) setUrl(resolved);
    });
    return () => {
      isCurrent = false;
    };
  }, [email, size]);

  return url;
};
