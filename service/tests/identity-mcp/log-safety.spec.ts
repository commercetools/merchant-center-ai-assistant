/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { sanitizeUrlForLog } from '../../src/utils/log-url.utils';

describe('identity OAuth callback log safety', () => {
  it('redacts code and state while retaining OAuth diagnostics', () => {
    const safe = sanitizeUrlForLog(
      '/service/managed-mcp-identity/callback?code=secret-code&state=csrf-state&iss=https%3A%2F%2Fauth2.example&error=access_denied'
    );
    expect(safe).not.toContain('secret-code');
    expect(safe).not.toContain('csrf-state');
    expect(safe).toContain('code=[redacted:11]');
    expect(safe).toContain('state=[redacted:10]');
    expect(safe).toContain('iss=https%3A%2F%2Fauth2.example');
    expect(safe).toContain('error=access_denied');
  });
});
