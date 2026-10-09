/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getPersistence, type Persistence } from '../persistence';
import { MessageService } from './message.service';
import { SessionService } from './session.service';
import { SettingsService } from './settings.service';
import { SuggestionsService, type SuggestionsDeps } from './suggestions.service';

/** The request-time services, built once on top of the persistence layer. */
export interface Services {
  persistence: Persistence;
  sessions: SessionService;
  messages: MessageService;
  settings: SettingsService;
  suggestions: SuggestionsService;
}

export function createServices(
  persistence: Persistence,
  overrides: { generateSuggestions?: SuggestionsDeps['generate'] } = {}
): Services {
  const sessions = new SessionService(persistence.sessions, persistence.messages);
  const settings = new SettingsService(persistence.settings);
  return {
    persistence,
    sessions,
    messages: new MessageService(persistence.messages, persistence.sessions),
    settings,
    suggestions: new SuggestionsService({
      sessions,
      suggestions: persistence.suggestions,
      settings,
      generate: overrides.generateSuggestions,
    }),
  };
}

let instance: Services | undefined;

/** Process-wide services (handlers call this per request; H and tests use it too). */
export function getServices(): Services {
  if (!instance) instance = createServices(getPersistence());
  return instance;
}

/** Tests install services over an in-memory or wrapped gateway. */
export function setServicesForTests(services: Services): void {
  instance = services;
}

export function resetServicesForTests(): void {
  instance = undefined;
}
