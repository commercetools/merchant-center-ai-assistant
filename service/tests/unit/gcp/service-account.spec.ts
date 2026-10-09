/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  ServiceAccountKeyError,
  parseServiceAccountKey,
} from '../../../src/gcp/service-account';
import { encodeKey, fakeKeyBase64, fakeKeyJson } from '../../helpers/gcp';

const SENTINEL = 'SENTINEL-DO-NOT-LEAK';

function failure(input: string): ServiceAccountKeyError {
  try {
    parseServiceAccountKey(input);
  } catch (e) {
    expect(e).toBeInstanceOf(ServiceAccountKeyError);
    return e as ServiceAccountKeyError;
  }
  throw new Error('expected a failure');
}

describe('parseServiceAccountKey', () => {
  it('accepts a valid key and keeps only the allowed fields', () => {
    const key = parseServiceAccountKey(fakeKeyBase64());
    expect(key.project_id).toBe('fake-project-123');
    expect(key.client_email).toBe('svc@fake-project-123.iam.gserviceaccount.com');
    expect(key.private_key).toMatch(new RegExp('^-----BEGIN ' + 'PRIVATE KEY-----'));
    expect(key.token_uri).toBe('https://oauth2.example.test/token');
    expect(Object.keys(key)).not.toContain('extra_field');
  });

  it('decodes URL-safe and line-wrapped Base64 identically', () => {
    const standard = fakeKeyBase64();
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_');
    const wrapped = urlSafe.replace(/(.{64})/g, '$1\n');
    expect(parseServiceAccountKey(wrapped)).toEqual(parseServiceAccountKey(standard));
  });

  it('normalises escaped newlines', () => {
    const json = fakeKeyJson();
    json.private_key = (json.private_key as string).replace(/\n/g, '\\n');
    const key = parseServiceAccountKey(encodeKey(json));
    expect(key.private_key).toContain('\n');
    expect(key.private_key).not.toContain('\\n');
  });

  it('accepts an RSA PEM header', () => {
    const json = fakeKeyJson({ private_key: '-----BEGIN RSA ' + 'PRIVATE KEY-----\nabc\n' });
    expect(parseServiceAccountKey(encodeKey(json)).private_key).toContain('RSA');
  });

  const cases: Array<[string, string, string]> = [
    ['empty', '  \n ', 'GCP_SA_KEY_BASE64: empty'],
    ['too large', 'A'.repeat(16 * 1024 + 1), 'GCP_SA_KEY_BASE64: too large'],
    ['not base64', `${SENTINEL}!!`, 'GCP_SA_KEY_BASE64: not valid base64'],
    [
      'not JSON',
      Buffer.from('hello').toString('base64'),
      'GCP_SA_KEY_BASE64: decoded value is not JSON',
    ],
    [
      'array',
      Buffer.from('[1]').toString('base64'),
      'GCP_SA_KEY_BASE64: decoded JSON is not an object',
    ],
    [
      'null',
      Buffer.from('null').toString('base64'),
      'GCP_SA_KEY_BASE64: decoded JSON is not an object',
    ],
    [
      'missing field',
      encodeKey(fakeKeyJson({ project_id: undefined })),
      'GCP_SA_KEY_BASE64: missing field "project_id"',
    ],
    [
      'wrong type',
      encodeKey(fakeKeyJson({ type: 'authorized_user' })),
      'GCP_SA_KEY_BASE64: field "type" must be "service_account"',
    ],
    [
      'bad email',
      encodeKey(fakeKeyJson({ client_email: 'someone@example.com' })),
      'GCP_SA_KEY_BASE64: client_email is not a service-account address',
    ],
    [
      'bad pem',
      encodeKey(fakeKeyJson({ private_key: 'not a pem' })),
      'GCP_SA_KEY_BASE64: private_key is not a PEM private key',
    ],
  ];

  it.each(cases)('reports %s with a fixed reason', (_name, input, message) => {
    expect(failure(input).message).toBe(message);
  });

  it('never leaks any part of the input into the error', () => {
    const inputs = [
      Buffer.from(SENTINEL).toString('base64'),
      encodeKey({ type: SENTINEL }),
      encodeKey(fakeKeyJson({ client_email: `${SENTINEL}@example.com` })),
      encodeKey(fakeKeyJson({ private_key: SENTINEL })),
      Buffer.from(`{"a": ${SENTINEL}`).toString('base64'),
    ];
    for (const input of inputs) {
      const error = failure(input);
      expect(error.message).not.toContain(SENTINEL);
      expect(JSON.stringify(error)).not.toContain(SENTINEL);
      expect(String(error.stack)).not.toContain(SENTINEL);
    }
  });
});
