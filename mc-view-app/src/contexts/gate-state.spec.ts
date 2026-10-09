/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { deriveGateState, type GateInput } from './gate-state';

const ok: GateInput = {
  loading: false,
  error: null,
  errorStatus: null,
  identityMcpConfigured: true,
  identityConnected: true,
  statusError: null,
};

describe('deriveGateState', () => {
  const cases: [string, Partial<GateInput>, string][] = [
    ['bootstrap in flight', { loading: true }, 'loading'],
    [
      'expired Merchant Center session',
      { error: 'x', errorStatus: 401 },
      'unauthorized',
    ],
    ['project not served', { error: 'x', errorStatus: 403 }, 'forbidden'],
    ['service failure (500)', { error: 'x', errorStatus: 500 }, 'error'],
    ['service unreachable', { error: 'x', errorStatus: null }, 'error'],
    [
      'no binding',
      { identityMcpConfigured: false, identityConnected: null },
      'no-binding',
    ],
    [
      'identity status failed',
      { statusError: 'boom', identityConnected: false },
      'error',
    ],
    ['identity status not read yet', { identityConnected: null }, 'loading'],
    ['not connected', { identityConnected: false }, 'connect'],
    ['connected', {}, 'ready'],
  ];

  it.each(cases)('%s', (_name, overrides, expected) => {
    expect(deriveGateState({ ...ok, ...overrides })).toBe(expected);
  });

  it('a bootstrap error wins over a missing binding', () => {
    expect(
      deriveGateState({
        ...ok,
        error: 'x',
        errorStatus: 401,
        identityMcpConfigured: false,
      })
    ).toBe('unauthorized');
  });

  it('loading wins over everything', () => {
    expect(
      deriveGateState({ ...ok, loading: true, error: 'x', errorStatus: 401 })
    ).toBe('loading');
  });
});
