/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createHmac } from 'node:crypto';
import { http, HttpResponse, passthrough } from 'msw';
import { setupServer } from 'msw/node';
import {
  exportJWK,
  generateKeyPair,
  JWK,
  KeyLike,
  SignJWT,
} from 'jose';

/** Issuer of the default test region (CTP_REGION=us-central1.gcp -> gcp-us). */
export const ISSUER_US = 'https://mc-api.us-central1.gcp.commercetools.com';
export const ISSUER_EU = 'https://mc-api.europe-west1.gcp.commercetools.com';
export const AUDIENCE_ORIGIN = 'https://svc.example.test';
export const SESSION_PATH = '/service/auth/session';
export const KID = 'test-key-1';

export const GATEWAY_HEADERS = {
  'x-mc-api-cloud-identifier': 'gcp-us',
  'x-mc-api-forward-to-version': 'v2',
} as const;

export interface TestKey {
  privateKey: KeyLike;
  publicJwk: JWK;
}

export async function makeKey(kid = KID): Promise<TestKey> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  return { privateKey, publicJwk: { ...publicJwk, kid, alg: 'RS256', use: 'sig' } };
}

export interface SignOptions {
  key: TestKey;
  aud?: string;
  iss?: string;
  sub?: string | null;
  projectKey?: string | null;
  extraClaims?: Record<string, unknown>;
  /** jose time string or absolute seconds; default 60 s. */
  expiresIn?: string | number;
}

export async function signToken(o: SignOptions): Promise<string> {
  const iss = o.iss ?? ISSUER_US;
  const claims: Record<string, unknown> = { ...(o.extraClaims ?? {}) };
  if (o.projectKey !== null) {
    claims[`${iss}/claims/project_key`] = o.projectKey ?? 'p';
  }
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(iss)
    .setAudience(o.aud ?? `${AUDIENCE_ORIGIN}${SESSION_PATH}`)
    .setIssuedAt()
    .setExpirationTime(o.expiresIn ?? '60s');
  if (o.sub !== null) jwt = jwt.setSubject(o.sub ?? 'user-1');
  return jwt.sign(o.key.privateKey);
}

const b64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** `alg: none` token (hand-made: jose refuses to sign it). */
export function unsignedToken(): string {
  const payload = {
    iss: ISSUER_US,
    aud: `${AUDIENCE_ORIGIN}${SESSION_PATH}`,
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 60,
    [`${ISSUER_US}/claims/project_key`]: 'p',
  };
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

/** HS256 token signed with a shared secret (algorithm confusion attempt). */
export function hs256Token(secret: string): string {
  const payload = {
    iss: ISSUER_US,
    aud: `${AUDIENCE_ORIGIN}${SESSION_PATH}`,
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + 60,
    [`${ISSUER_US}/claims/project_key`]: 'p',
  };
  const head = `${b64({ alg: 'HS256', typ: 'JWT', kid: KID })}.${b64(payload)}`;
  const sig = createHmac('sha256', secret).update(head).digest('base64url');
  return `${head}.${sig}`;
}

/** msw server that serves the JWKS of the test key at the US issuer. */
export function startJwksServer(key: TestKey): {
  close: () => void;
} {
  const server = setupServer(
    http.get(`${ISSUER_US}/.well-known/jwks.json`, () =>
      HttpResponse.json({ keys: [key.publicJwk] })
    ),
    // supertest talks to a local ephemeral server: let it through.
    http.all(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\//, () => passthrough())
  );
  server.listen({ onUnhandledFrame: 'error' });
  return { close: () => server.close() };
}
