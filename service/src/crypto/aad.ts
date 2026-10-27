/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { stateKey } from '../persistence/names';

/**
 * The single place that decides the aad of every identity envelope. The identity MCP code
 * encrypts and decrypts with these, and `reencryptAll` rotates with the same values; a
 * mismatch would make a rotation fail every record, so nobody builds these strings by hand.
 */

/** The project's OAuth client envelope in the settings object (one per project). */
export const IDENTITY_CLIENT_AAD = 'default';

/** The user's token envelope: bound to the record key, which is the user id. */
export const identityTokensAad = (userId: string): string => userId;

/** The PKCE verifier envelope: bound to the record key, which is the hashed state. */
export const identityVerifierAad = (state: string): string => stateKey(state);
