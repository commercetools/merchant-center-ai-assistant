/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration, type AppConfig } from '../config';
import type { Persistence } from '../persistence';
import { getServices } from '../services/registry';
import type { ToolContext } from '../tool-sources/types';
import type { ChatSession } from '../types/chat.types';
import type { RequestUser } from '../types/request.types';
import type { Log } from '../utils/log.types';
import { logger } from '../utils/logger.utils';
import type { UrlReference } from '../utils/url-references';
import { RequestBudget } from './request-budget';

/** Default request locale (the same default as the legacy router). */
export const DEFAULT_LOCALE = 'en';

export interface CreateToolContextParams {
  user: RequestUser;
  session: ChatSession;
  budget: RequestBudget;
  /** `req.query.locale`; anything but a non-empty string falls back to `en`. */
  locale?: unknown;
  urlReferences?: UrlReference[];
  config?: AppConfig;
  stores?: Persistence;
  log?: Log;
}

export const localeOf = (value: unknown): string =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, 35)
    : DEFAULT_LOCALE;

/**
 * Builds the per-request `ToolContext`: the loaded session, the project system prompt (read
 * once through the request-scoped settings memo), the temporary-table sentences, and the
 * budget. Identity comes from the verified user only.
 */
export const createToolContext = async (
  params: CreateToolContextParams
): Promise<ToolContext> => {
  const services = getServices();
  const { user, session, budget } = params;
  const [temporaryTableMessages, projectSystemPrompt] = await Promise.all([
    services.sessions.getTemporaryTableMessages(session.id, user),
    services.settings.getSystemPrompt(),
  ]);
  return {
    user,
    sessionId: session.id,
    session,
    locale: localeOf(params.locale),
    projectSystemPrompt,
    temporaryTableMessages,
    urlReferences: params.urlReferences ?? [],
    config: params.config ?? readConfiguration(),
    stores: params.stores ?? services.persistence,
    abortSignal: budget.hardSignal,
    budget,
    logger: params.log ?? logger,
  };
};

/**
 * A context for requests that are not a chat turn (the tools menu, the connected-sources
 * list). It carries a short-lived budget that the caller MUST `dispose()`.
 */
export const createDetachedContext = (params: {
  user: RequestUser;
  session: ChatSession;
  locale?: unknown;
}): { ctx: ToolContext; dispose: () => void } => {
  const config = readConfiguration();
  const gone = new AbortController();
  const budget = new RequestBudget(
    Date.now(),
    config.chat.requestBudgetMs,
    config.chat.finalizeReserveMs,
    gone.signal
  );
  const services = getServices();
  return {
    ctx: {
      user: params.user,
      sessionId: params.session.id,
      session: params.session,
      locale: localeOf(params.locale),
      projectSystemPrompt: '',
      temporaryTableMessages: [],
      urlReferences: [],
      config,
      stores: services.persistence,
      abortSignal: budget.hardSignal,
      budget,
      logger,
    },
    dispose: () => budget.dispose(),
  };
};

/** A placeholder session for contexts that have none (the connected-sources list). */
export const emptySessionFor = (user: RequestUser): ChatSession => ({
  id: '',
  userId: user.userId,
  createdAt: 0,
  updatedAt: 0,
  schemaVersion: 1,
});
