/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { resetConfigurationForTests } from '../../src/config';
import { freshConfig } from '../helpers/env';

beforeEach(() => resetConfigurationForTests());

describe('chat section (request budget)', () => {
  it('defaults to 270 s with a 30 s reserve', () => {
    expect(freshConfig().chat).toEqual({
      requestBudgetMs: 270000,
      finalizeReserveMs: 30000,
      digestBeforeClose: false,
    });
  });

  it('accepts overrides', () => {
    const c = freshConfig({
      CHAT_REQUEST_BUDGET_MS: '40000',
      CHAT_FINALIZE_RESERVE_MS: '10000',
    });
    expect(c.chat).toEqual({
      requestBudgetMs: 40000,
      finalizeReserveMs: 10000,
      digestBeforeClose: false,
    });
  });

  it('CHAT_DIGEST_BEFORE_CLOSE switches the digest fallback on and rejects other values', () => {
    expect(
      freshConfig({ CHAT_DIGEST_BEFORE_CLOSE: 'true' }).chat.digestBeforeClose
    ).toBe(true);
    expect(() => freshConfig({ CHAT_DIGEST_BEFORE_CLOSE: 'yes' })).toThrow(
      /CHAT_DIGEST_BEFORE_CLOSE/
    );
  });

  it('rejects a budget above the platform limit, naming key and maximum', () => {
    expect(() => freshConfig({ CHAT_REQUEST_BUDGET_MS: '300000' })).toThrow(
      /CHAT_REQUEST_BUDGET_MS: must be an integer <= 285000/
    );
  });

  it.each([
    ['CHAT_REQUEST_BUDGET_MS', '270.5', /CHAT_REQUEST_BUDGET_MS/],
    ['CHAT_REQUEST_BUDGET_MS', 'soon', /CHAT_REQUEST_BUDGET_MS/],
    ['CHAT_FINALIZE_RESERVE_MS', '4999', /CHAT_FINALIZE_RESERVE_MS/],
    ['CHAT_FINALIZE_RESERVE_MS', '135001', /CHAT_FINALIZE_RESERVE_MS/],
    ['CHAT_FINALIZE_RESERVE_MS', '1.5', /CHAT_FINALIZE_RESERVE_MS/],
  ])('rejects %s=%s', (key, value, pattern) => {
    expect(() => freshConfig({ [key]: value })).toThrow(pattern);
  });

  it('accepts the exact boundaries', () => {
    expect(
      freshConfig({
        CHAT_REQUEST_BUDGET_MS: '285000',
        CHAT_FINALIZE_RESERVE_MS: '142500',
      }).chat.requestBudgetMs
    ).toBe(285000);
    expect(
      freshConfig({ CHAT_FINALIZE_RESERVE_MS: '5000' }).chat.finalizeReserveMs
    ).toBe(5000);
  });

  it('rejects a reserve larger than half of a custom budget', () => {
    expect(() =>
      freshConfig({
        CHAT_REQUEST_BUDGET_MS: '20000',
        CHAT_FINALIZE_RESERVE_MS: '10001',
      })
    ).toThrow(/CHAT_FINALIZE_RESERVE_MS/);
  });
});
