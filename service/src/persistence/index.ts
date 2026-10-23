/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export {
  createPersistence,
  deleteSessionCascade,
  getPersistence,
  resetPersistenceForTests,
} from './create-persistence';
export type { Persistence, PersistenceOptions } from './create-persistence';

export { SKIP, updateWithRetry } from './gateway/cas';
export * from './gateway/errors';
export type { ObjectGateway, StoredObject } from './gateway/types';
export { assertSafeId, stateKey } from './names';

export type { SessionStore } from './stores/session.store';
export type { MessageStore, NewMessage } from './stores/message.store';
export type { SettingsStore } from './stores/settings.store';
export type { TokenStore } from './stores/token.store';
export type { FeedbackParts, FeedbackStore } from './stores/feedback.store';
export type { SuggestionStore } from './stores/suggestion.store';

export type {
  DisabledTools,
  FeatureFlags,
  NextPrompt,
  SessionRecord,
  TemporaryTable,
} from './types/session';
export type { MessageRole, StoredMessage } from './types/message';
export type {
  IdentityMcpBindingRecord,
  IdentityMcpClientRecord,
  IdentityMcpDiscoveryRecord,
  Settings,
  ToolCallLogsMode,
} from './types/settings';
export type {
  ClaimResult,
  IdentityAuthStateRecord,
  IdentityTokenRecord,
} from './types/identity';
export type {
  FeedbackListFilters,
  FeedbackListItem,
  FeedbackRecord,
  FeedbackSnapshotChunk,
  SnapshotMessage,
} from './types/feedback';
export type { PromptSuggestion, UserSuggestions } from './types/suggestion';

