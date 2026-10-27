/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { withTurn } from './with-turn';

describe('withTurn', () => {
  it('starts a query on a plain path', () => {
    expect(withTurn('ai-chat/s1/message/stream', 'm1')).toBe(
      'ai-chat/s1/message/stream?messageId=m1'
    );
  });

  it('continues a query that is already there', () => {
    expect(
      withTurn(
        'https://svc.example/service/ai-chat/s1/message/stream?locale=en',
        'm1'
      )
    ).toBe(
      'https://svc.example/service/ai-chat/s1/message/stream?locale=en&messageId=m1'
    );
  });

  it('encodes the id', () => {
    expect(withTurn('x', 'a b&c=d/é')).toBe(
      'x?messageId=a%20b%26c%3Dd%2F%C3%A9'
    );
  });

  it('leaves the url alone without an id', () => {
    expect(withTurn('x?locale=en')).toBe('x?locale=en');
    expect(withTurn('x', '')).toBe('x');
  });
});
