/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../config';
import { readConfiguration } from '../config';
import { CustomObjectGateway } from './gateway/custom-object.gateway';
import { MemoryObjectGateway } from './gateway/memory.gateway';
import type { ObjectGateway } from './gateway/types';
import { containers, PREFIX } from './names';
import type { StoreDeps } from './stores/deps';
import { GatewayFeedbackStore, FeedbackStore } from './stores/feedback.store';
import { GatewayMessageStore, MessageStore } from './stores/message.store';
import { GatewaySessionStore, SessionStore } from './stores/session.store';
import { GatewaySettingsStore, SettingsStore } from './stores/settings.store';
import { GatewaySuggestionStore, SuggestionStore } from './stores/suggestion.store';
import { GatewayTokenStore, TokenStore } from './stores/token.store';

export interface Persistence {
  sessions: SessionStore;
  messages: MessageStore;
  settings: SettingsStore;
  tokens: TokenStore;
  feedback: FeedbackStore;
  suggestions: SuggestionStore;
  /** The gateway everything runs on (maintenance scripts and tests). */
  gateway: ObjectGateway;
}

export interface PersistenceOptions {
  gateway?: ObjectGateway;
  /** Container prefix; integration tests use `ai-assistant-it-<random>`. */
  containerPrefix?: string;
}

export function createPersistence(
  cfg: Pick<AppConfig, 'persistence'>,
  opts: PersistenceOptions = {}
): Persistence {
  const gw =
    opts.gateway ??
    (cfg.persistence.driver === 'memory'
      ? new MemoryObjectGateway()
      : new CustomObjectGateway());
  const deps: StoreDeps = {
    gw,
    c: containers(opts.containerPrefix ?? PREFIX),
    concurrency: cfg.persistence.concurrency,
  };
  return {
    sessions: new GatewaySessionStore(deps),
    messages: new GatewayMessageStore(deps),
    settings: new GatewaySettingsStore(deps, cfg.persistence.settingsCacheTtlMs),
    tokens: new GatewayTokenStore(deps),
    feedback: new GatewayFeedbackStore(deps),
    suggestions: new GatewaySuggestionStore(deps),
    gateway: gw,
  };
}

let instance: Persistence | undefined;

/** Process-wide instance for the app; tests call `createPersistence` directly. */
export function getPersistence(): Persistence {
  if (!instance) instance = createPersistence(readConfiguration());
  return instance;
}

export function resetPersistenceForTests(): void {
  instance = undefined;
}

/**
 * Deletes the messages first and the session object last. Idempotent: safe to re-run after a
 * partial failure. Resolves `true` when the session object existed.
 */
export async function deleteSessionCascade(
  p: Pick<Persistence, 'sessions' | 'messages'>,
  sessionId: string
): Promise<boolean> {
  const had = await p.sessions.get(sessionId);
  await p.messages.deleteAll(sessionId);
  const removed = await p.sessions.delete(sessionId);
  return had !== null || removed;
}
