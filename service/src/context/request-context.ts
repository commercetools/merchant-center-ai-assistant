/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Settings } from '../persistence';
import { RequestUser } from '../types/request.types';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  user?: RequestUser;
  /** The session of this request (untyped here). */
  session?: unknown;
  /** Memo of the settings read of this request (see SettingsService). */
  settings?: Promise<Settings>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T =>
  storage.run(ctx, fn);

export const getContext = (): RequestContext | undefined => storage.getStore();

export const getUserFromContext = (): RequestUser | undefined =>
  storage.getStore()?.user;

export const setUserInContext = (user: RequestUser | undefined): void => {
  const ctx = storage.getStore();
  if (ctx) ctx.user = user;
};

export const getSessionFromContext = (): unknown =>
  storage.getStore()?.session;

export const setSessionInContext = (session: unknown): void => {
  const ctx = storage.getStore();
  if (ctx) ctx.session = session;
};
