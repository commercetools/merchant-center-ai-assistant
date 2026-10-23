/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { sanitizeUrlForLog } from '../../src/utils/log-url.utils';
import { runWithContext } from '../../src/context/request-context';
import { logger } from '../../src/utils/logger.utils';
import { captureLogs } from '../helpers/log-capture';

describe('sanitizeUrlForLog', () => {
  it('returns a URL without a query unchanged', () => {
    expect(sanitizeUrlForLog('/service/status')).toBe('/service/status');
  });

  it('redacts the OAuth callback code and state, keeps diagnostics', () => {
    const out = sanitizeUrlForLog('/service/x/callback?code=SECRET&state=S&error=denied');
    expect(out).toContain('code=[redacted:6]');
    expect(out).toContain('state=[redacted:1]');
    expect(out).toContain('error=denied');
    expect(out).not.toContain('SECRET');
  });

  it.each([
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'client_secret',
    'code_verifier',
    'assertion',
  ])('redacts %s case-insensitively', (name) => {
    const out = sanitizeUrlForLog(`/x?${name.toUpperCase()}=abcdef&keep=1`);
    expect(out).not.toContain('abcdef');
    expect(out).toContain('[redacted:6]');
    expect(out).toContain('keep=1');
  });

  it('leaves non-sensitive parameters alone', () => {
    expect(sanitizeUrlForLog('/x?a=1&b=2')).toBe('/x?a=1&b=2');
  });
});

describe('logger', () => {
  it('adds the correlation id inside a request context', () => {
    const capture = captureLogs();
    runWithContext({ requestId: 'r1', correlationId: 'abc-123' }, () =>
      logger.info('inside')
    );
    logger.info('outside');
    capture.stop();
    const inside = JSON.parse(capture.lines[0]);
    const outside = JSON.parse(capture.lines[1]);
    expect(inside.correlationId).toBe('abc-123');
    expect(outside.correlationId).toBeUndefined();
  });
});
