/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import { producedAnswer } from '../../src/agents/turn-digest';

/**
 * The digest runs after a turn and renames the session, so the one thing it must not do is
 * describe a turn that failed.
 *
 * A turn that errored, or was cut off mid tool call, still leaves a user message and an
 * assistant message in the array - just with no text in it. Digesting that renames the
 * conversation after a question nobody answered and offers three confident follow-ups to a
 * failure. Because the call is fire-and-forget nobody sees it happen; the wrong title just
 * appears in the list.
 */
describe('a turn is only digested when it produced an answer', () => {
  test('an assistant reply with text counts', () => {
    expect(
      producedAnswer([
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', parts: [{ type: 'text', text: 'Three are below target.' }] },
      ])
    ).toBe(true);
  });

  test('a user message alone does not - this is the errored turn', () => {
    expect(
      producedAnswer([{ role: 'user', parts: [{ type: 'text', text: 'hello' }] }])
    ).toBe(false);
  });

  test('an assistant turn that is only a tool call does not', () => {
    expect(
      producedAnswer([
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        {
          role: 'assistant',
          parts: [{ type: 'tool-commercetools', state: 'output-available' }],
        },
      ])
    ).toBe(false);
  });

  test('whitespace is not an answer', () => {
    expect(
      producedAnswer([
        { role: 'assistant', parts: [{ type: 'text', text: '   \n  ' }] },
      ])
    ).toBe(false);
  });

  test('an empty turn does not', () => {
    expect(producedAnswer([])).toBe(false);
  });

  test('malformed messages never throw', () => {
    expect(() =>
      producedAnswer([null, undefined, 42, { role: 'assistant' }])
    ).not.toThrow();
    expect(producedAnswer([null, { role: 'assistant' }])).toBe(false);
  });
});
