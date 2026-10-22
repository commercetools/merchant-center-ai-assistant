/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { findKey, kidOf, KeyRing, loadKeys } from './keys';

export type EncryptedKind =
  | 'identity-client'
  | 'identity-tokens'
  | 'identity-verifier';

const KINDS: readonly EncryptedKind[] = [
  'identity-client',
  'identity-tokens',
  'identity-verifier',
];

export interface Envelope {
  v: 1;
  kind: EncryptedKind;
  kid: string;
  iv: string;
  tag: string;
  ct: string;
}

/** Base class; messages are fixed strings and never carry plaintext, ciphertext, aad or keys. */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class EnvelopeMalformed extends CryptoError {
  constructor() {
    super('Encrypted envelope is malformed');
  }
}
export class EnvelopeKindMismatch extends CryptoError {
  constructor() {
    super('Encrypted envelope has a different kind than expected');
  }
}
export class EnvelopeKeyUnknown extends CryptoError {
  constructor() {
    super('No configured encryption key matches the envelope key id');
  }
}
export class EnvelopeAuthFailed extends CryptoError {
  constructor() {
    super('Encrypted envelope failed authentication (wrong record or tampered data)');
  }
}

const AUTH_TAG_LENGTH = 16;

const aadBytes = (kind: EncryptedKind, aad: string): Buffer =>
  Buffer.from(`${kind}|${aad}`, 'utf8');

export function encryptJson<T>(
  kind: EncryptedKind,
  value: T,
  aad: string,
  keys: KeyRing = loadKeys()
): Envelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys.primary, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(aadBytes(kind, aad));
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    v: 1,
    kind,
    kid: kidOf(keys.primary),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

function isEnvelope(e: unknown): e is Envelope {
  if (typeof e !== 'object' || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    o.v === 1 &&
    typeof o.kind === 'string' &&
    typeof o.kid === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.tag === 'string' &&
    typeof o.ct === 'string'
  );
}

export function decryptJson<T>(
  kind: EncryptedKind,
  envelope: Envelope | undefined,
  aad: string,
  keys: KeyRing = loadKeys()
): T {
  if (!isEnvelope(envelope) || !KINDS.includes(envelope.kind)) {
    throw new EnvelopeMalformed();
  }
  if (envelope.kind !== kind) throw new EnvelopeKindMismatch();
  const key = findKey(keys, envelope.kid);
  if (!key) throw new EnvelopeKeyUnknown();
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
      { authTagLength: AUTH_TAG_LENGTH }
    );
    decipher.setAAD(aadBytes(kind, aad));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(envelope.ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plain) as T;
  } catch {
    // Deliberately drops the cause: it can echo lengths or fragments.
    throw new EnvelopeAuthFailed();
  }
}
