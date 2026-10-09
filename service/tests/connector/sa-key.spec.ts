/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { checkSaKey } from '../../src/connector/checks/sa-key';
import { encodeKey, fakeKeyBase64 } from '../helpers/gcp';

describe('checkSaKey', () => {
  it('sa-key: valid', () => {
    const result = checkSaKey(fakeKeyBase64());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      expect(result.projectId).toBe('fake-project-123');
    }
  });

  it('sa-key: not base64', () => {
    expect(checkSaKey('***not base64***')).toEqual({ ok: false, reason: 'not valid base64' });
  });

  it('sa-key: not json', () => {
    const encoded = Buffer.from('plain text', 'utf8').toString('base64');
    expect(checkSaKey(encoded)).toEqual({ ok: false, reason: 'decoded value is not JSON' });
  });

  it('sa-key: wrong type', () => {
    const result = checkSaKey(fakeKeyBase64({ type: 'authorized_user' }));
    expect(result).toEqual({ ok: false, reason: 'field "type" must be "service_account"' });
  });

  it('sa-key: missing private_key', () => {
    const result = checkSaKey(fakeKeyBase64({ private_key: undefined }));
    expect(result.ok).toBe(false);
  });

  it('sa-key: malformed private_key', () => {
    const result = checkSaKey(fakeKeyBase64({ private_key: 'FAKE' }));
    expect(result.ok).toBe(false);
  });

  it('sa-key: project mismatch warns', () => {
    const result = checkSaKey(fakeKeyBase64(), 'other-project-9');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.projectId).toBe('other-project-9');
    }
  });

  it('sa-key: configured project equal to the key project does not warn', () => {
    const result = checkSaKey(fakeKeyBase64(), 'fake-project-123');
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('sa-key: reason never echoes input', () => {
    const marker = 'MARKER-VALUE-123';
    const inputs = [
      marker,
      Buffer.from(marker, 'utf8').toString('base64'),
      encodeKey({ type: 'service_account', project_id: marker }),
      fakeKeyBase64({ client_email: `${marker}@elsewhere.test` }),
      fakeKeyBase64({ private_key: marker }),
    ];
    for (const input of inputs) {
      const result = checkSaKey(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).not.toContain(marker);
        expect(result.reason).not.toContain(input);
      }
    }
  });
});
