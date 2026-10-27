/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Persistence } from '../../persistence';
import { SKIP } from '../../persistence';
import type {
  IdentityAuthStateStore,
  IdentityBindingStore,
  IdentityStores,
  IdentityTokenStore,
} from '../ports';

/**
 * The only file that knows the persistence store method names. Binding and the OAuth client
 * live in `settings.identityMcp`; tokens and PKCE attempts in the token store.
 */
export function createIdentityStores(
  p: Pick<Persistence, 'settings' | 'tokens'>
): IdentityStores {
  const binding: IdentityBindingStore = {
    get: async () => (await p.settings.get()).identityMcp ?? null,
    set: async (b) => {
      await p.settings.update((s) => ({ ...s, identityMcp: { ...b } }));
    },
    setClient: async (c) => {
      await p.settings.update((s) => {
        if (!s.identityMcp) return SKIP;
        const rest = { ...s.identityMcp };
        delete rest.client;
        return { ...s, identityMcp: c ? { ...rest, client: c } : rest };
      });
    },
    clear: async () => {
      await p.settings.update((s) => {
        if (!s.identityMcp) return SKIP;
        const rest = { ...s };
        delete rest.identityMcp;
        return rest;
      });
    },
  };

  const tokens: IdentityTokenStore = {
    get: (userId) => p.tokens.getTokensWithVersion(userId),
    put: (record) => p.tokens.putTokens(record),
    deleteIfVersion: (userId, version) =>
      p.tokens.deleteTokensIfVersion(userId, version),
    delete: (userId) => p.tokens.deleteTokens(userId),
    deleteAll: (beforeDelete) => p.tokens.deleteAllTokens(beforeDelete),
  };

  const authStates: IdentityAuthStateStore = {
    create: (r) => p.tokens.createAuthState(r),
    claim: (state) => p.tokens.claimAuthState(state),
  };

  return { binding, tokens, authStates };
}
