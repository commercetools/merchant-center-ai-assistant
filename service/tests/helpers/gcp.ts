/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { generateKeyPairSync } from 'node:crypto';

let pem: string | undefined;

/** A throwaway RSA key generated at test time: never a real credential. */
function fakePem(): string {
  pem ??= generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  return pem;
}

export function fakeKeyJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'service_account',
    project_id: 'fake-project-123',
    private_key_id: 'fakekeyid',
    private_key: fakePem(),
    client_email: 'svc@fake-project-123.iam.gserviceaccount.com',
    client_id: '1234567890',
    token_uri: 'https://oauth2.example.test/token',
    extra_field: 'must-be-dropped',
    ...overrides,
  };
}

export function encodeKey(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
}

export const fakeKeyBase64 = (overrides: Record<string, unknown> = {}): string =>
  encodeKey(fakeKeyJson(overrides));
