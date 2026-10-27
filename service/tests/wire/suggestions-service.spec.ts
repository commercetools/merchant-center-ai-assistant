/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { jest } from '@jest/globals';
import { MockLanguageModelV3 } from 'ai/test';
import request from 'supertest';
import { buildUserPrompt, generateSuggestions } from '../../src/agents/suggestions.agent';
import { generateSessionDigest } from '../../src/agents/session-digest.agent';
import type { PromptSuggestion } from '../../src/persistence';
import { setConnectedSourcesProvider } from '../../src/services/connected-sources.provider';
import { DEFAULT_SUGGESTIONS } from '../../src/services/suggestions.service';
import type { RequestUser } from '../../src/types/request.types';
import { asUser, makeSessionApp, resetSessionApp } from '../helpers/session-app';

const USER: RequestUser = { userId: 'user-a', projectKey: 'p', isAdmin: false };

const generated: PromptSuggestion[] = Array.from({ length: 4 }, (_, i) => ({
  icon: 'sell',
  title: `Generated ${i}`,
  detail: 'd',
  prompt: `p${i}`,
}));

afterEach(() => {
  resetSessionApp();
  setConnectedSourcesProvider({ list: async () => [] });
});

/** A session that finished a turn: has a digest and a summary. */
async function digestedSession(t: ReturnType<typeof makeSessionApp>, at = Date.now()) {
  const s = await t.services.sessions.create(USER, {});
  await t.persistence.sessions.update(s.id, (cur) => ({
    ...cur,
    title: 'Orders',
    summary: 'The user checked orders.',
    digestUpdatedAt: at,
  }));
  return s;
}

describe('SuggestionsService', () => {
  it('no history: defaults, personalised false, no model call', async () => {
    const generate = jest.fn(async () => generated);
    const t = makeSessionApp({ generateSuggestions: generate });
    const res = await t.services.suggestions.getForUser(USER, 'en');
    expect(res).toEqual({ suggestions: DEFAULT_SUGGESTIONS, personalised: false });
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates and caches, then reuses the cache', async () => {
    const generate = jest.fn(async () => generated);
    const t = makeSessionApp({ generateSuggestions: generate });
    await digestedSession(t, Date.now() - 1000);
    const first = await t.services.suggestions.getForUser(USER, 'en');
    expect(first).toEqual({ suggestions: generated, personalised: true });
    const second = await t.services.suggestions.getForUser(USER, 'en');
    expect(second).toEqual({ suggestions: generated, personalised: true });
    expect(generate).toHaveBeenCalledTimes(1);
    const cached = await t.persistence.suggestions.get(USER.userId);
    expect(cached?.locale).toBe('en');
    expect(cached?.basedOn).toHaveLength(1);
  });

  it('a newer digest invalidates the cache', async () => {
    const generate = jest.fn(async () => generated);
    const t = makeSessionApp({ generateSuggestions: generate });
    await digestedSession(t, Date.now() - 1000);
    await t.services.suggestions.getForUser(USER, 'en');
    await new Promise((r) => setTimeout(r, 3));
    await digestedSession(t, Date.now());
    await t.services.suggestions.getForUser(USER, 'en');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('a locale change regenerates', async () => {
    const generate = jest.fn(async () => generated);
    const t = makeSessionApp({ generateSuggestions: generate });
    await digestedSession(t, Date.now() - 1000);
    await t.services.suggestions.getForUser(USER, 'en');
    await t.services.suggestions.getForUser(USER, 'de');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('a model failure yields the defaults', async () => {
    const t = makeSessionApp({
      generateSuggestions: async () => {
        throw new Error('model down');
      },
    });
    await digestedSession(t);
    expect(await t.services.suggestions.getForUser(USER, 'en')).toEqual({
      suggestions: DEFAULT_SUGGESTIONS,
      personalised: false,
    });
  });

  it('a null generation yields the defaults', async () => {
    const t = makeSessionApp({ generateSuggestions: async () => null });
    await digestedSession(t);
    expect((await t.services.suggestions.getForUser(USER, 'en')).personalised).toBe(false);
  });

  it('passes connected sources and the system prompt to the generator', async () => {
    setConnectedSourcesProvider({ list: async () => ['stripe'] });
    const generate = jest.fn(async () => generated);
    const t = makeSessionApp({ generateSuggestions: generate });
    await t.services.settings.setSystemPrompt('We sell mugs.');
    await digestedSession(t);
    await t.services.suggestions.getForUser(USER, 'en');
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ connectedSources: ['stripe'], projectPrompt: 'We sell mugs.' })
    );
  });

  it('a store failure yields the defaults', async () => {
    const t = makeSessionApp();
    t.persistence.suggestions.get = async () => {
      throw new Error('boom');
    };
    expect((await t.services.suggestions.getForUser(USER, 'en')).suggestions).toHaveLength(4);
  });
});

describe('GET /suggestions', () => {
  it('always answers 200 with four cards, even when the store and the model throw', async () => {
    const t = makeSessionApp({
      generateSuggestions: async () => {
        throw new Error('model down');
      },
    });
    await digestedSession(t);
    t.persistence.suggestions.get = async () => {
      throw new Error('store down');
    };
    const res = await request(t.app).get('/service/suggestions?locale=de').set(asUser('user-a'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.suggestions).toHaveLength(4);
    expect(res.body.data.personalised).toBe(false);
  });

  it('ignores a silly locale', async () => {
    const generate = jest.fn(async () => generated);
    const t = makeSessionApp({ generateSuggestions: generate });
    await digestedSession(t);
    await request(t.app).get(`/service/suggestions?locale=${'x'.repeat(100)}`).set(asUser('user-a'));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
  });
});

describe('model-facing agents', () => {
  it('the prompt says commercetools (always) with no third-party sources', () => {
    expect(
      buildUserPrompt({ recentSummaries: [], connectedSources: [], locale: 'en' })
    ).toContain('Data sources available: commercetools (always)');
  });

  it('generateSuggestions returns null (never throws) when no model is configured', async () => {
    makeSessionApp();
    await expect(
      generateSuggestions({ recentSummaries: [], connectedSources: [], locale: 'en' })
    ).resolves.toBeNull();
  });

  it('generateSessionDigest returns null (never throws) when no model is configured', async () => {
    makeSessionApp();
    await expect(
      generateSessionDigest({ messages: [{ role: 'user', content: 'hi' }] })
    ).resolves.toBeNull();
  });

  it('generateSuggestions parses a mocked model answer', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ suggestions: generated }) }],
        finishReason: { unified: 'stop', raw: 'STOP' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }),
    });
    const out = await generateSuggestions(
      { recentSummaries: [], connectedSources: [], locale: 'en' },
      model
    );
    expect(out).toHaveLength(4);
  });
});
