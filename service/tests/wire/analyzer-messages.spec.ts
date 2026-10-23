/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import {
  endWithUserMessage,
  sanitizeMessages,
} from '../../src/utils/message.utils';

/**
 * The message shape the aggregation analyzer sends to Gemini.
 *
 * This is a WIRE CONTRACT, not a unit test of a helper: `generateContent` rejects a request
 * whose `contents` ends with a model turn, with
 *
 *   HTTP 400 "Requests ending with a model turn are not supported."
 *
 * and it names neither the caller nor the offending message. The analyzer runs once per tool
 * call, so the observable symptom is a burst of identical 400s that look like a tool-calling
 * failure. It was invisible until MCP tool schemas started being accepted, because before
 * that no tool ever executed and the analyzer never ran - so the regression this guards
 * against is one that only shows up when everything else is working.
 */
const ORCHESTRATOR_HISTORY = [
  {
    role: 'user',
    content: 'how many products we have that are related to coffee?',
  },
  // An assistant turn that is purely a tool call: no text parts at all.
  {
    role: 'assistant',
    content: [{ type: 'tool-call', toolName: 'read_products', input: {} }],
  },
  { role: 'tool', content: [{ type: 'tool-result', output: { total: 42 } }] },
  {
    role: 'assistant',
    content: [
      { type: 'tool-call', toolName: 'read_product_search', input: {} },
    ],
  },
  { role: 'tool', content: [{ type: 'tool-result', output: { total: 7 } }] },
];

/** Exactly what analyzer.agent.ts does. */
const forAnalyzer = (messages: unknown[]) =>
  endWithUserMessage(
    sanitizeMessages(messages, {
      maxMessages: 10,
      excludeToolMessages: true,
      filterEmpty: true,
    })
  );

describe('analyzer message shaping', () => {
  test('does not end on a model turn for a tool-calling history', () => {
    const shaped = forAnalyzer(ORCHESTRATOR_HISTORY);

    expect(shaped).toEqual([
      {
        role: 'user',
        content: 'how many products we have that are related to coffee?',
      },
    ]);
  });

  test('drops a real assistant reply that would land last', () => {
    // `filterEmpty` cannot help here - the assistant turn has genuine text - so the trailing
    // trim is what keeps the request legal.
    const shaped = forAnalyzer([
      { role: 'user', content: 'how many coffee products?' },
      { role: 'assistant', content: 'There are 42.' },
    ]);

    expect(shaped.map((message) => message.role)).toEqual(['user']);
  });

  test('keeps interior assistant turns, which carry the conversation', () => {
    const shaped = forAnalyzer([
      { role: 'user', content: 'how many coffee products?' },
      { role: 'assistant', content: 'There are 42.' },
      { role: 'user', content: 'and how many are decaf?' },
    ]);

    expect(shaped.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
  });

  test('reduces an all-model history to nothing rather than sending it', () => {
    // The analyzer treats an empty result as "no aggregation needed", which is the right
    // default: there is no user question left to judge.
    expect(forAnalyzer([{ role: 'assistant', content: 'hello' }])).toEqual([]);
    expect(endWithUserMessage([])).toEqual([]);
  });
});
