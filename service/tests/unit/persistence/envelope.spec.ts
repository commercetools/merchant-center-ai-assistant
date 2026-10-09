/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { randomBytes } from 'node:crypto';
import {
  decryptJson,
  encryptJson,
  EnvelopeAuthFailed,
  EnvelopeKeyUnknown,
  EnvelopeKindMismatch,
  EnvelopeMalformed,
} from '../../../src/crypto/envelope';
import { kidOf, KeyRing } from '../../../src/crypto/keys';

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const ring1: KeyRing = { primary: k1, previous: [] };
const ring2: KeyRing = { primary: k2, previous: [k1] };
const SECRET = 'SECRET-TOKEN-123';

describe('envelope', () => {
  it('round trips', () => {
    const env = encryptJson('identity-tokens', { accessToken: SECRET }, 'user-1', ring1);
    expect(env.v).toBe(1);
    expect(env.kid).toBe(kidOf(k1));
    expect(Buffer.from(env.iv, 'base64')).toHaveLength(12);
    expect(JSON.stringify(env)).not.toContain(SECRET);
    expect(decryptJson('identity-tokens', env, 'user-1', ring1)).toEqual({
      accessToken: SECRET,
    });
  });

  it('uses a fresh iv every time', () => {
    const a = encryptJson('identity-tokens', 1, 'u', ring1);
    const b = encryptJson('identity-tokens', 1, 'u', ring1);
    expect(a.iv).not.toBe(b.iv);
  });

  it('fails for a different record (aad)', () => {
    const env = encryptJson('identity-tokens', { a: 1 }, 'user-1', ring1);
    expect(() => decryptJson('identity-tokens', env, 'user-2', ring1)).toThrow(
      EnvelopeAuthFailed
    );
  });

  it('fails for a different kind', () => {
    const env = encryptJson('identity-tokens', { a: 1 }, 'user-1', ring1);
    expect(() => decryptJson('identity-client', env, 'user-1', ring1)).toThrow(
      EnvelopeKindMismatch
    );
  });

  it('fails when ciphertext or tag is tampered', () => {
    const env = encryptJson('identity-verifier', 'abc', 'u', ring1);
    const ct = Buffer.from(env.ct, 'base64');
    ct[0] = ct[0] ^ 1;
    expect(() =>
      decryptJson('identity-verifier', { ...env, ct: ct.toString('base64') }, 'u', ring1)
    ).toThrow(EnvelopeAuthFailed);
    const tag = Buffer.from(env.tag, 'base64');
    tag[0] = tag[0] ^ 1;
    expect(() =>
      decryptJson('identity-verifier', { ...env, tag: tag.toString('base64') }, 'u', ring1)
    ).toThrow(EnvelopeAuthFailed);
  });

  it('rejects malformed input', () => {
    expect(() => decryptJson('identity-tokens', undefined, 'u', ring1)).toThrow(
      EnvelopeMalformed
    );
    expect(() =>
      decryptJson('identity-tokens', { v: 2 } as never, 'u', ring1)
    ).toThrow(EnvelopeMalformed);
  });

  it('supports rotation through the previous keys', () => {
    const old = encryptJson('identity-tokens', { n: 1 }, 'u', ring1);
    expect(decryptJson('identity-tokens', old, 'u', ring2)).toEqual({ n: 1 });
    const fresh = encryptJson('identity-tokens', { n: 1 }, 'u', ring2);
    expect(fresh.kid).toBe(kidOf(k2));
    expect(() => decryptJson('identity-tokens', old, 'u', { primary: k2, previous: [] })).toThrow(
      EnvelopeKeyUnknown
    );
  });

  it('keeps plaintext, aad and keys out of error messages', () => {
    const env = encryptJson('identity-tokens', { t: SECRET }, 'very-secret-aad', ring1);
    const messages: string[] = [];
    for (const attempt of [
      () => decryptJson('identity-tokens', env, 'other', ring1),
      () => decryptJson('identity-client', env, 'very-secret-aad', ring1),
      () => decryptJson('identity-tokens', env, 'x', { primary: k2, previous: [] }),
    ]) {
      try {
        attempt();
      } catch (e) {
        messages.push((e as Error).message);
      }
    }
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m).not.toContain(SECRET);
      expect(m).not.toContain('very-secret-aad');
      expect(m).not.toContain(k1.toString('base64'));
    }
  });
});
