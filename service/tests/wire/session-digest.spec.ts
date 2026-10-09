/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { beforeEach, describe, expect, test } from '@jest/globals';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
} from '@ai-sdk/provider';
import { MockLanguageModelV3 } from 'ai/test';
import {
  DIGEST_HISTORY_CUTOFF,
  generateSessionDigest,
  normaliseDigest,
} from '../../src/agents/session-digest.agent';
import { DIGEST_ICON_NAMES } from '../../src/constants/digest-icons';
import { freshConfig } from '../helpers/env';

// generateSessionDigest reads the lite tier's provider options from the configuration.
beforeEach(() => {
  freshConfig();
});

/**
 * The session digest is the one model call whose output is written straight into a document
 * the UI reads on every render. Two things therefore matter more than the prose quality:
 *
 *  1. It is IMPOSSIBLE for a model response to produce an unrenderable session row. A title
 *     that is three paragraphs long, an icon the client has never heard of, eight follow-up
 *     chips - each of those breaks a layout that has no scrollbar and no fallback. Every one
 *     is clamped or dropped here rather than defended against in React.
 *  2. A partly-bad response still yields a usable digest. The call runs fire-and-forget
 *     after the stream closes, so a thrown schema error is silent - the user just never gets
 *     a title. Clamping beats validating for exactly that reason, and this file pins the
 *     choice down.
 */

const VALID = {
  title: 'Underperforming products, September',
  description:
    'Three products are tracking below their revenue target for 30 days.',
  icon: 'trending_down',
  summary:
    'The user asked which products are underperforming. Three were below target.',
  nextPrompts: [
    {
      text: 'Why did the mug drop?',
      prompt: 'Why did Classic Beer Mug sales drop?',
    },
    {
      text: 'Draft a discount',
      prompt: 'Draft a 15% discount for Classic Beer Mug.',
    },
    {
      text: 'Compare last quarter',
      prompt: 'Compare this against last quarter.',
    },
  ],
};

/** One `doGenerate` result carrying `text` as the whole model response. */
const textResult = (text: string): LanguageModelV3GenerateResult => ({
  content: [{ type: 'text', text }],
  finishReason: { unified: 'stop', raw: 'STOP' },
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 10, text: 10, reasoning: 0 },
  },
  warnings: [],
});

/** A model that answers every call with one fixed JSON body. */
const modelReturning = (payload: unknown) =>
  new MockLanguageModelV3({
    doGenerate: async () => textResult(JSON.stringify(payload)),
  });

describe('session digest normalisation', () => {
  test('keeps a well-formed digest intact', () => {
    expect(normaliseDigest(VALID)).toEqual(VALID);
  });

  test('clamps an over-long title on a word boundary rather than dropping the digest', () => {
    const digest = normaliseDigest({
      ...VALID,
      title:
        'A conversation about every single underperforming product in the entire catalogue this month',
    });

    expect(digest.title.length).toBeLessThanOrEqual(60);
    expect(digest.title.endsWith('…')).toBe(true);
    // The rest of the digest survives the over-long field.
    expect(digest.icon).toBe('trending_down');
    expect(digest.nextPrompts).toHaveLength(3);
  });

  test('clamps description and summary', () => {
    const digest = normaliseDigest({
      ...VALID,
      description: 'x'.repeat(400),
      summary: 'y'.repeat(2000),
    });

    expect(digest.description.length).toBeLessThanOrEqual(140);
    expect(digest.summary.length).toBeLessThanOrEqual(400);
  });

  test('falls back to auto_awesome for an icon the client cannot render', () => {
    expect(normaliseDigest({ ...VALID, icon: 'rocket_launch' }).icon).toBe(
      'auto_awesome'
    );
    expect(normaliseDigest({ ...VALID, icon: undefined }).icon).toBe(
      'auto_awesome'
    );
    expect(normaliseDigest({ ...VALID, icon: 42 }).icon).toBe('auto_awesome');
  });

  test('every name the model may emit is one the client maps', () => {
    for (const icon of DIGEST_ICON_NAMES) {
      expect(normaliseDigest({ ...VALID, icon }).icon).toBe(icon);
    }
  });

  test('keeps at most three follow-ups and drops incomplete ones', () => {
    const digest = normaliseDigest({
      ...VALID,
      nextPrompts: [
        { text: 'One', prompt: 'First' },
        { text: '', prompt: 'No label' },
        { text: 'No body', prompt: '   ' },
        { text: 'Two', prompt: 'Second' },
        { text: 'Three', prompt: 'Third' },
        { text: 'Four', prompt: 'Fourth' },
      ],
    });

    expect(digest.nextPrompts.map((p) => p.text)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  test('survives a response that is missing everything', () => {
    const digest = normaliseDigest({});
    expect(digest).toEqual({
      title: '',
      description: '',
      icon: 'auto_awesome',
      summary: '',
      nextPrompts: [],
    });
  });

  test('survives null and non-objects', () => {
    expect(() => normaliseDigest(null)).not.toThrow();
    expect(() => normaliseDigest('nonsense')).not.toThrow();
    expect(normaliseDigest(null).icon).toBe('auto_awesome');
  });
});

describe('session digest generation', () => {
  /**
   * Regression: the digest silently stopped being generated in production.
   *
   *   HTTP 400 "Requests ending with a model turn are not supported."
   *
   * A finished turn ends with the assistant's reply, and `generateContent` rejects a
   * request whose `contents` ends with a model turn. `sanitizeMessages` does not fix that -
   * `endWithUserMessage` does, and this call site never called it. The bug was latent for
   * as long as the digest has existed: `gemini-3.1-flash-lite-preview` tolerated the shape
   * and `gemini-3.5-flash-lite` does not, so changing the model is what surfaced it.
   *
   * Asserting on the prompt the provider actually received, because the return value cannot
   * tell the difference - the failure is caught and reported as "no digest".
   */
  /**
   * The shape a real turn actually has, which neither of the fixtures below covers: ONE
   * user prompt followed by many assistant steps.
   *
   * This is what broke the digest in production twice. Sent as a chat history it ends with
   * a model turn and the API rejects it with a 400; guarded with `endWithUserMessage` the
   * 20-message window contains no user turn at all, so truncating back to the last one
   * emptied the history and the digest silently returned null without calling the model.
   *
   * Both earlier tests happened to keep a user turn inside the window - one was a two-turn
   * exchange, the other alternated user/assistant - so both passed while production failed.
   * That is the gap this fixture exists to close.
   */
  test('summarises a turn whose window contains no user message', async () => {
    let received: Array<{ role: string }> = [];
    const model = new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        received = options.prompt as unknown as Array<{ role: string }>;
        return textResult(JSON.stringify(VALID));
      },
    });

    const digest = await generateSessionDigest({
      messages: [
        { role: 'user', content: 'Set up a carts vs orders dashboard' },
        ...Array.from({ length: 30 }, (_, i) => ({
          role: 'assistant',
          content: `step ${i}`,
        })),
      ],
      model,
    });

    expect(digest).toEqual(VALID);

    const conversation = received.filter((m) => m.role !== 'system');
    // One message, and it is the user's: nothing for the API to reject.
    expect(conversation).toHaveLength(1);
    expect(conversation[0].role).toBe('user');
    // The assistant's last step survives - it is the best evidence for a title.
    expect(JSON.stringify(conversation)).toContain('step 29');
  });

  test('never sends a prompt ending with a model turn', async () => {
    let received: Array<{ role: string }> = [];
    const model = new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        received = options.prompt as unknown as Array<{ role: string }>;
        return textResult(JSON.stringify(VALID));
      },
    });

    const digest = await generateSessionDigest({
      messages: [
        { role: 'user', content: 'Set up a carts vs orders dashboard' },
        { role: 'assistant', content: 'Here is the dashboard.' },
      ],
      model,
    });

    expect(digest).toEqual(VALID);
    expect(received.length).toBeGreaterThan(0);
    expect(received[received.length - 1].role).toBe('user');
  });

  test('produces a digest from a conversation', async () => {
    const digest = await generateSessionDigest({
      messages: [
        { role: 'user', content: 'Which products are underperforming?' },
        { role: 'assistant', content: 'Three are below target.' },
      ],
      model: modelReturning(VALID),
    });

    expect(digest).toEqual(VALID);
  });

  test('returns null, and never calls the model, when there is nothing to summarise', async () => {
    let called = false;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        called = true;
        throw new Error('the model must not be called for an empty history');
      },
    });

    // An assistant turn that is purely a tool call sanitises to a placeholder and is
    // filtered out, leaving nothing - the same state as a session with no messages.
    const digest = await generateSessionDigest({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool-call', toolName: 'x', input: {} }],
        },
      ],
      model,
    });

    expect(digest).toBeNull();
    expect(called).toBe(false);
  });

  test('returns null instead of throwing when the model fails', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error('503 model overloaded');
      },
    });

    await expect(
      generateSessionDigest({
        messages: [{ role: 'user', content: 'hello' }],
        model,
      })
    ).resolves.toBeNull();
  });

  test('returns null when the model answers with unparseable output', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => textResult('I am not JSON.'),
    });

    await expect(
      generateSessionDigest({
        messages: [{ role: 'user', content: 'hello' }],
        model,
      })
    ).resolves.toBeNull();
  });

  test('sends only the tail of a long conversation, and no tool messages', async () => {
    let sentPrompt: unknown[] = [];
    const model = new MockLanguageModelV3({
      doGenerate: async ({ prompt }: LanguageModelV3CallOptions) => {
        sentPrompt = prompt as unknown[];
        return textResult(JSON.stringify(VALID));
      },
    });

    const messages = [
      ...Array.from({ length: 40 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `turn ${i}`,
      })),
      {
        role: 'tool',
        content: [{ type: 'tool-result', output: { huge: 'payload' } }],
      },
    ];

    await generateSessionDigest({ messages, model });

    // One system message plus the capped conversation tail.
    const conversation = sentPrompt.filter(
      (m) => (m as { role: string }).role !== 'system'
    );
    expect(conversation.length).toBeLessThanOrEqual(DIGEST_HISTORY_CUTOFF);
    expect(
      conversation.some((m) => (m as { role: string }).role === 'tool')
    ).toBe(false);
    // The window arrives as a single user message holding the transcript, so the cap is
    // enforced on the turns that go INTO it rather than on the message count.
    expect(conversation).toHaveLength(1);
    expect((conversation[0] as { role: string }).role).toBe('user');

    // The tail, not the head: the most recent turns are what the session is "about".
    // `turn 39` is an assistant turn and is kept - a transcript has no trailing-model-turn
    // problem to guard against, which is the point of sending it this way.
    expect(JSON.stringify(conversation)).toContain('turn 39');
    expect(JSON.stringify(conversation)).not.toContain('user: turn 0');
  });
});
