/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import {
  IDENTITY_CLIENT_AAD,
  identityTokensAad,
  identityVerifierAad,
} from '../../src/crypto/aad';
import { decryptJson, encryptJson } from '../../src/crypto/envelope';
import type { KeyRing } from '../../src/crypto/keys';
import { stateKey } from '../../src/persistence';

const keys: KeyRing = { primary: randomBytes(32), previous: [] };

describe('identity envelope aad', () => {
  it('matches the record keys the persistence stores use', () => {
    expect(identityTokensAad('user-1')).toBe('user-1');
    expect(identityVerifierAad('st')).toBe(stateKey('st'));
    expect(IDENTITY_CLIENT_AAD).toBe('default');
  });

  it('an envelope only opens with the aad of its own record', () => {
    const env = encryptJson('identity-tokens', { a: 1 }, identityTokensAad('u1'), keys);
    expect(decryptJson('identity-tokens', env, identityTokensAad('u1'), keys)).toEqual({ a: 1 });
    expect(() => decryptJson('identity-tokens', env, identityTokensAad('u2'), keys)).toThrow();
    expect(() => decryptJson('identity-tokens', env, IDENTITY_CLIENT_AAD, keys)).toThrow();
  });

  it('the verifier is bound to the hashed state, not the raw state', () => {
    const env = encryptJson('identity-verifier', 'v', identityVerifierAad('st'), keys);
    expect(() => decryptJson('identity-verifier', env, 'st', keys)).toThrow();
    expect(decryptJson('identity-verifier', env, stateKey('st'), keys)).toBe('v');
  });
});
