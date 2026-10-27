/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createHash } from 'node:crypto';
import { InvalidIdError } from './gateway/errors';

export const PREFIX = 'ai-assistant';

/** Conservative container/key rule; the real platform rule is probed live. */
const SAFE_NAME = /^[A-Za-z0-9_.~-]{1,256}$/;
/** Caller-supplied identifiers (session, message, feedback, user ids). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function assertSafeName(name: string): string {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) {
    throw new InvalidIdError('Invalid container or key name');
  }
  return name;
}

export function assertSafeId(id: string): string {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) {
    throw new InvalidIdError('Invalid identifier');
  }
  return id;
}

/** Key of a PKCE state: the state itself never becomes a key. */
export const stateKey = (state: string): string =>
  createHash('sha256').update(state, 'utf8').digest('hex');

/** Container names. */
export function containers(prefix: string = PREFIX) {
  return {
    settings: () => `${prefix}-settings`,
    sessions: () => `${prefix}-sessions`,
    messages: (sessionId: string) => `${prefix}-messages-${assertSafeId(sessionId)}`,
    messagesPrefix: () => `${prefix}-messages-`,
    tokens: () => `${prefix}-identity-tokens`,
    states: () => `${prefix}-identity-auth-states`,
    feedback: () => `${prefix}-feedback`,
    feedbackSnap: (feedbackId: string) =>
      `${prefix}-feedback-snap-${assertSafeId(feedbackId)}`,
    feedbackSnapPrefix: () => `${prefix}-feedback-snap-`,
    suggestions: () => `${prefix}-suggestions`,
  };
}

export type Containers = ReturnType<typeof containers>;
