/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Adds `messageId=<id>` to a service URL, after any query it already has. The id is the one
 * from the `start` frame of the answer the user is looking at; the service uses it to serve a
 * reconnect, or apply a stop, only to that turn and not to another one of the same session.
 * Without an id the URL is unchanged.
 */
export const withTurn = (url: string, messageId?: string): string => {
  if (!messageId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}messageId=${encodeURIComponent(messageId)}`;
};
