/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The only code that touches the raw GCP_SA_KEY_BASE64 secret.
 * Error reasons come from a closed list: they never contain any part of the input.
 */

export interface ServiceAccountKey {
  type: 'service_account';
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
  client_id?: string;
  token_uri?: string;
}

export type ServiceAccountKeyReason =
  | 'empty'
  | 'not valid base64'
  | 'too large'
  | 'decoded value is not JSON'
  | 'decoded JSON is not an object'
  | `missing field "${string}"`
  | 'field "type" must be "service_account"'
  | 'client_email is not a service-account address'
  | 'private_key is not a PEM private key';

export class ServiceAccountKeyError extends Error {
  constructor(readonly reason: ServiceAccountKeyReason) {
    super(`GCP_SA_KEY_BASE64: ${reason}`);
    this.name = 'ServiceAccountKeyError';
  }
}

const MAX_ENCODED_LENGTH = 16 * 1024;
const REQUIRED_FIELDS = ['type', 'project_id', 'client_email', 'private_key'] as const;
const OPTIONAL_FIELDS = ['private_key_id', 'client_id', 'token_uri'] as const;

function decodeJsonObject(input: string): Record<string, unknown> {
  const compact = input.replace(/\s+/g, '');
  if (!compact) throw new ServiceAccountKeyError('empty');
  if (compact.length > MAX_ENCODED_LENGTH) throw new ServiceAccountKeyError('too large');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
    throw new ServiceAccountKeyError('not valid base64');
  }
  const text = Buffer.from(
    compact.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The caught error may quote the input: never forward it.
    throw new ServiceAccountKeyError('decoded value is not JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ServiceAccountKeyError('decoded JSON is not an object');
  }
  return parsed as Record<string, unknown>;
}

function normalizePrivateKey(raw: string): string {
  const privateKey =
    !raw.includes('\n') && raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  if (!/^-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) {
    throw new ServiceAccountKeyError('private_key is not a PEM private key');
  }
  return privateKey;
}

/** Decodes and validates the Base64 service-account JSON. Throws ServiceAccountKeyError. */
export function parseServiceAccountKey(input: string): ServiceAccountKey {
  const obj = decodeJsonObject(input);

  for (const field of REQUIRED_FIELDS) {
    const value = obj[field];
    if (typeof value !== 'string' || value === '') {
      throw new ServiceAccountKeyError(`missing field "${field}"`);
    }
  }
  if (obj.type !== 'service_account') {
    throw new ServiceAccountKeyError('field "type" must be "service_account"');
  }
  const email = obj.client_email as string;
  if (!email.includes('@') || !email.endsWith('gserviceaccount.com')) {
    throw new ServiceAccountKeyError('client_email is not a service-account address');
  }
  const privateKey = normalizePrivateKey(obj.private_key as string);

  const key: ServiceAccountKey = {
    type: 'service_account',
    project_id: obj.project_id as string,
    client_email: email,
    private_key: privateKey,
  };
  for (const field of OPTIONAL_FIELDS) {
    const value = obj[field];
    if (typeof value === 'string') key[field] = value;
  }
  return key;
}
