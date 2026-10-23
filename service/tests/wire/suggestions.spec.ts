/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import {
  isCacheFresh,
  SUGGESTIONS_TTL_MS,
  DEFAULT_SUGGESTIONS,
} from '../../src/services/suggestions.service';
import {
  normaliseSuggestions,
  buildUserPrompt,
  WANTED_SUGGESTIONS,
} from '../../src/agents/suggestions.agent';
import { DIGEST_ICON_NAMES } from '../../src/constants/digest-icons';
import type { UserSuggestions } from '../../src/types/chat.types';

/**
 * Prompt suggestions sit on the critical path of opening a new chat, which shapes both
 * things tested here.
 *
 * The cache decides whether that screen costs a model call. Get the freshness rule wrong in
 * the lenient direction and users see suggestions that ignore everything they did today;
 * get it wrong in the strict direction and every new chat pays for a generation. Neither
 * failure is visible as a bug - the screen looks fine either way - so the rule is pinned
 * here rather than left to be read off the implementation.
 *
 * Normalisation is the same bargain the session digest makes: clamp rather than reject, so
 * a chatty response loses its tail instead of the whole feature.
 */

const cached = (overrides: Partial<UserSuggestions> = {}): UserSuggestions => ({
  suggestions: DEFAULT_SUGGESTIONS,
  generatedAt: 1_700_000_000_000,
  locale: 'en',
  basedOn: ['session-1'],
  ...overrides,
});

const NOW = 1_700_000_000_000 + 60_000;

describe('suggestion cache freshness', () => {
  test('a recent set for the same locale is reused', () => {
    expect(isCacheFresh(cached(), 'en', 0, NOW)).toBe(true);
  });

  test('nothing cached is never fresh', () => {
    expect(isCacheFresh(null, 'en', 0, NOW)).toBe(false);
  });

  test('an empty cached set is never fresh', () => {
    expect(isCacheFresh(cached({ suggestions: [] }), 'en', 0, NOW)).toBe(false);
  });

  test('a different locale forces regeneration - the cards are written in the user language', () => {
    expect(isCacheFresh(cached(), 'de', 0, NOW)).toBe(false);
  });

  test('a set older than the TTL is stale', () => {
    const old = cached({ generatedAt: NOW - SUGGESTIONS_TTL_MS - 1 });
    expect(isCacheFresh(old, 'en', 0, NOW)).toBe(false);
  });

  test('a conversation finished since it was written makes it stale', () => {
    // The whole point: the suggestions are built from session summaries, so a new summary
    // is exactly the event they should respond to.
    const digestAfter = cached().generatedAt + 1;
    expect(isCacheFresh(cached(), 'en', digestAfter, NOW)).toBe(false);
  });

  test('a conversation finished BEFORE it was written does not', () => {
    const digestBefore = cached().generatedAt - 1;
    expect(isCacheFresh(cached(), 'en', digestBefore, NOW)).toBe(true);
  });
});

describe('suggestion normalisation', () => {
  const valid = {
    suggestions: Array.from({ length: 4 }, (_, i) => ({
      icon: 'receipt_long',
      title: `Title ${i}`,
      detail: `Detail ${i}`,
      prompt: `Prompt ${i}`,
    })),
  };

  test('keeps a well-formed response', () => {
    expect(normaliseSuggestions(valid)).toHaveLength(WANTED_SUGGESTIONS);
  });

  test('clamps over-long titles and details rather than dropping the card', () => {
    const [card] = normaliseSuggestions({
      suggestions: [
        {
          icon: 'sell',
          title: 'x'.repeat(200),
          detail: 'y'.repeat(400),
          prompt: 'go',
        },
      ],
    });

    expect(card.title.length).toBeLessThanOrEqual(40);
    expect(card.detail.length).toBeLessThanOrEqual(90);
    expect(card.prompt).toBe('go');
  });

  test('falls back to auto_awesome for an icon the client cannot render', () => {
    const [card] = normaliseSuggestions({
      suggestions: [{ icon: 'rocket', title: 'A', detail: 'B', prompt: 'C' }],
    });
    expect(card.icon).toBe('auto_awesome');
  });

  test('drops cards with no title or no prompt, and caps the rest at four', () => {
    const cards = normaliseSuggestions({
      suggestions: [
        { icon: 'sell', title: 'Keep 1', detail: 'd', prompt: 'p' },
        { icon: 'sell', title: '', detail: 'd', prompt: 'p' },
        { icon: 'sell', title: 'No prompt', detail: 'd', prompt: '  ' },
        { icon: 'sell', title: 'Keep 2', detail: 'd', prompt: 'p' },
        { icon: 'sell', title: 'Keep 3', detail: 'd', prompt: 'p' },
        { icon: 'sell', title: 'Keep 4', detail: 'd', prompt: 'p' },
        { icon: 'sell', title: 'Too many', detail: 'd', prompt: 'p' },
      ],
    });

    expect(cards.map((c) => c.title)).toEqual([
      'Keep 1',
      'Keep 2',
      'Keep 3',
      'Keep 4',
    ]);
  });

  test('survives garbage', () => {
    expect(normaliseSuggestions(null)).toEqual([]);
    expect(normaliseSuggestions({})).toEqual([]);
    expect(normaliseSuggestions({ suggestions: 'nope' })).toEqual([]);
  });

  test('the static defaults are themselves renderable by the client', () => {
    for (const suggestion of DEFAULT_SUGGESTIONS) {
      expect(DIGEST_ICON_NAMES).toContain(suggestion.icon);
      expect(suggestion.title.length).toBeLessThanOrEqual(40);
      expect(suggestion.detail.length).toBeLessThanOrEqual(90);
      expect(suggestion.prompt.length).toBeGreaterThan(0);
    }
    expect(DEFAULT_SUGGESTIONS).toHaveLength(WANTED_SUGGESTIONS);
  });
});

describe('the prompt the model actually receives', () => {
  const base = {
    recentSummaries: [],
    connectedSources: [],
    locale: 'en',
  };

  test('tells the model to show range when the user has no history', () => {
    expect(buildUserPrompt(base)).toContain('no history yet');
  });

  test('carries recent work, and forbids re-asking it', () => {
    const prompt = buildUserPrompt({
      ...base,
      recentSummaries: [
        {
          title: 'Underperforming products',
          summary: 'Three were below target.',
        },
      ],
    });

    expect(prompt).toContain('Underperforming products');
    expect(prompt).toContain('Three were below target.');
    expect(prompt).toContain('Do not re-ask');
  });

  test('names only the sources this project has, so nothing is suggested for a source it lacks', () => {
    const prompt = buildUserPrompt({ ...base, connectedSources: ['stripe'] });
    expect(prompt).toContain('stripe');
    expect(prompt).not.toContain('contentstack');
  });

  test('says nothing about an analytics warehouse', () => {
    // The prompt used to state whether the warehouse was connected, from
    // project.warehouseEnabled. Nothing can set that field any more - the endpoint that
    // wrote it is gone - so a frozen flag was being reported to the model as fact.
    const prompt = buildUserPrompt(base);

    expect(prompt).not.toMatch(/Analytics warehouse/i);
    expect(prompt).not.toMatch(/avoid suggesting deep historical aggregation/i);
  });
});
