#!/usr/bin/env node
/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */
// Prints an RS256 JWT signed with a throwaway key and claims for another audience. The service must
// reject it (unknown key, wrong audience); the key is generated per call and never stored.
// Usage: node scripts/e2e/make-bad-jwt.mjs
import { createSign, generateKeyPairSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

export function makeBadJwt(now = Math.floor(Date.now() / 1000)) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const header = { alg: 'RS256', typ: 'JWT', kid: 'e2e-throwaway' };
  const claims = { iss: 'https://mc-api.invalid', aud: 'https://other.invalid', sub: 'x', exp: now + 60, iat: now };
  const input = `${b64url(header)}.${b64url(claims)}`;
  const sig = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url');
  return `${input}.${sig}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(makeBadJwt());
}
