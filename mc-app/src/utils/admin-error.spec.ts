/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  describeAdminError,
  isAdminRequiredError,
  ServiceRequestError,
} from './admin-error';
import { ForwardToError } from './forward-to';

const forwardTo = (status: number, body: string) =>
  new ForwardToError('https://service.example.invalid/service/x', status, body);

describe('isAdminRequiredError', () => {
  it('recognises a 403 with code ADMIN_REQUIRED from the shared request helper', () => {
    expect(
      isAdminRequiredError(
        forwardTo(
          403,
          JSON.stringify({ success: false, code: 'ADMIN_REQUIRED' })
        )
      )
    ).toBe(true);
  });

  it('recognises it from the identity-MCP request error', () => {
    expect(
      isAdminRequiredError(new ServiceRequestError('no', 403, 'ADMIN_REQUIRED'))
    ).toBe(true);
  });

  it('does not treat other failures as an admin refusal', () => {
    expect(isAdminRequiredError(forwardTo(403, '{"code":"OTHER"}'))).toBe(
      false
    );
    expect(isAdminRequiredError(forwardTo(500, 'boom'))).toBe(false);
    expect(isAdminRequiredError(forwardTo(403, 'not json'))).toBe(false);
    expect(isAdminRequiredError(new Error('x'))).toBe(false);
    expect(isAdminRequiredError(undefined)).toBe(false);
  });
});

describe('describeAdminError', () => {
  it('maps a refusal to the fixed text and others to their message', () => {
    expect(
      describeAdminError(forwardTo(403, '{"code":"ADMIN_REQUIRED"}'), 'x')
    ).toBe('Administrator access required');
    expect(describeAdminError(new Error('plain'), 'x')).toBe('plain');
    expect(describeAdminError('weird', 'fallback')).toBe('fallback');
  });
});
