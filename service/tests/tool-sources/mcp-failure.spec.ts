/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it } from '@jest/globals';
import { describeMcpFailure as describeIdentity } from '../../src/identity-mcp/errors';
import {
  describeMcpFailure,
  statusOf,
} from '../../src/tool-sources/mcp-failure';

class HandshakeError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
  }
}

describe('shared describeMcpFailure', () => {
  it('default: class and status only, never the message', () => {
    const error = new HandshakeError(
      'GET https://x.test/?key=SECRET failed',
      401
    );
    expect(describeMcpFailure(error)).toBe('HandshakeError status=401');
    expect(describeMcpFailure(new HandshakeError('boom'))).toBe(
      'HandshakeError'
    );
    expect(describeMcpFailure('plain')).toBe('String');
    expect(describeMcpFailure(undefined)).toBe('Error');
  });

  it('includeMessage: status and a bounded message', () => {
    expect(
      describeMcpFailure(new HandshakeError('nope', 403), {
        includeMessage: true,
      })
    ).toBe('403 nope');
    expect(
      describeMcpFailure(new Error('x'.repeat(500)), { includeMessage: true })
    ).toHaveLength(300);
    expect(describeMcpFailure('text', { includeMessage: true })).toBe('text');
  });

  it('the identity wrapper keeps the message, and statusOf reads statusCode or status', () => {
    expect(describeIdentity(new HandshakeError('denied', 403))).toBe(
      '403 denied'
    );
    expect(statusOf({ status: 404 })).toBe(404);
    expect(statusOf({ statusCode: 500 })).toBe(500);
    expect(statusOf('x')).toBeUndefined();
  });
});
