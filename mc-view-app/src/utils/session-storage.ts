/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Where the browser remembers which conversation it had open.
 *
 * Every access is guarded: `localStorage` throws in Safari private mode and whenever a
 * browser blocks storage for an embedded origin, and the Merchant Center hosts Custom Views
 * in exactly that position. Losing the remembered session is recoverable (the panel falls
 * back to the service's newest session for this page, or a new one); throwing is not.
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
  } catch {
    // Not remembered; the next load asks the service for the newest session.
  }
};

export const clearStoredSessionId = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
};
