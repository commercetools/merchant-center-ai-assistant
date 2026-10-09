/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { IdentityStores } from './ports';
import type { IdentityBinding, TokenRecord } from './types';

export interface IdentityConnection {
  /** A binding exists. */
  configured: boolean;
  /** The user has a token record issued for the CURRENT binding revision. */
  connected: boolean;
  binding: IdentityBinding | null;
  /** The record `connected` was derived from (metadata only; never decrypted here). */
  token: TokenRecord | null;
}

/**
 * Token records carry the binding revision (`connectedAt`) they were minted against, so a
 * rebind invalidates every user's consent without scanning. Millisecond equality is the check.
 */
export const sameRevision = (left?: number, right?: number): boolean =>
  left !== undefined && right !== undefined && left === right;

/**
 * One binding read and (when bound) one token read; no decryption. The `/status` endpoint and
 * the session bootstrap answer from this one rule so they can never disagree.
 */
export const readIdentityConnection = async (
  stores: Pick<IdentityStores, 'binding' | 'tokens'>,
  userId: string
): Promise<IdentityConnection> => {
  const binding = await stores.binding.get();
  if (!binding) {
    return { configured: false, connected: false, binding: null, token: null };
  }
  const found = await stores.tokens.get(userId);
  const connected = Boolean(
    found && sameRevision(found.record.bindingConnectedAt, binding.connectedAt)
  );
  return {
    configured: true,
    connected,
    binding,
    token: connected && found ? found.record : null,
  };
};

export const isIdentityUserConnected = async (
  stores: Pick<IdentityStores, 'binding' | 'tokens'>,
  userId: string
): Promise<boolean> => (await readIdentityConnection(stores, userId)).connected;
