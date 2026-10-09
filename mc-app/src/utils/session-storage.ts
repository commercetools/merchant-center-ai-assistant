/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Where the browser remembers which conversation it had open.
 *
 * Extracted from `SessionProvider` because two places now read it: the provider, and the
 * session bootstrap - which sends the remembered id so the service can return that
 * session's messages in the same response instead of the app asking for them afterwards.
 * A second copy of the literal is exactly the kind of thing that survives a rename in one
 * file and not the other, and the symptom would be every reload silently opening a
 * different conversation.
 *
 * Every access is guarded: `localStorage` throws in Safari private mode and whenever a
 * browser blocks storage for an embedded origin, and the Merchant Center hosts Custom
 * Applications in exactly that position. Losing the remembered session is recoverable;
 * throwing during the bootstrap is not.
 */
const STORAGE_KEY = 'chat-session-id';

export const readStoredSessionId = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export const writeStoredSessionId = (sessionId: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, sessionId);
  } catch {}
};

export const clearStoredSessionId = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
};
