/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  generateSuggestions,
  type SuggestionsContext,
} from '../agents/suggestions.agent';
import type { SuggestionStore } from '../persistence';
import type {
  PromptSuggestion,
  UserSuggestions,
} from '../types/chat.types';
import type { RequestUser } from '../types/request.types';
import { logger } from '../utils/logger.utils';
import { getConnectedSourcesProvider } from './connected-sources.provider';
import type { SessionService } from './session.service';
import type { SettingsService } from './settings.service';

/** How long a cached set stays fresh when the user has not finished a conversation. */
export const SUGGESTIONS_TTL_MS = 24 * 60 * 60 * 1000;

/** How many recent conversations shape the suggestions. */
const HISTORY_DEPTH = 5;

/**
 * What a user sees before the assistant knows anything about them. Mirrors the client's
 * own copy (`default-suggestions.ts`), which exists so the empty state renders even when
 * this endpoint is unreachable. Four different KINDS of task on purpose.
 */
export const DEFAULT_SUGGESTIONS: PromptSuggestion[] = [
  {
    icon: 'trending_down',
    title: 'Find underperforming products',
    detail: 'Compare the last 30 days against target revenue.',
    prompt: 'Which products are underperforming this month?',
  },
  {
    icon: 'sell',
    title: 'Draft a discount',
    detail: 'Set up a promotion and preview it before it goes live.',
    prompt: 'Draft a 15% discount for my best selling product, ending next Sunday.',
  },
  {
    icon: 'receipt_long',
    title: 'Check recent orders',
    detail: 'Look up an order, its payment and fulfillment status.',
    prompt: "What's the most recent order and how was it paid?",
  },
  {
    icon: 'dashboard_customize',
    title: 'Build a page from data',
    detail: 'Turn an answer into a shareable page for your team.',
    prompt: 'Build a page showing product sales trends for the last quarter.',
  },
];

export type SuggestionsResult = {
  suggestions: PromptSuggestion[];
  /** `false` when these are the static defaults rather than generated for this user. */
  personalised: boolean;
};

const defaults = (): SuggestionsResult => ({
  suggestions: DEFAULT_SUGGESTIONS,
  personalised: false,
});

/**
 * Is a cached set still good? It goes stale by age, when a conversation finished since it
 * was written (the signal the suggestions are built from), or when the locale changed.
 */
export const isCacheFresh = (
  cached: UserSuggestions | null,
  locale: string,
  newestDigestAt: number,
  now: number = Date.now()
): boolean => {
  if (!cached || !cached.suggestions?.length) return false;
  if (cached.locale !== locale) return false;
  if (now - cached.generatedAt > SUGGESTIONS_TTL_MS) return false;
  if (newestDigestAt > cached.generatedAt) return false;
  return true;
};

export type SuggestionsDeps = {
  sessions: SessionService;
  suggestions: SuggestionStore;
  settings: SettingsService;
  /** Test seam; production uses the `lite` model. */
  generate?: (c: SuggestionsContext) => Promise<PromptSuggestion[] | null>;
};

export class SuggestionsService {
  constructor(private readonly deps: SuggestionsDeps) {}

  /**
   * Opening prompts for a user's empty chat screen. Served from a per-user cache; a miss
   * falls back to the static set instead of failing. Never throws.
   */
  async getForUser(user: RequestUser, locale: string): Promise<SuggestionsResult> {
    try {
      const records = await this.deps.sessions.listRecords(user);
      const digested = records
        .filter((s) => s.digestUpdatedAt && s.summary)
        .slice(0, HISTORY_DEPTH);
      const newestDigestAt = digested.reduce(
        (newest, s) => Math.max(newest, s.digestUpdatedAt ?? 0),
        0
      );

      const cached = await this.deps.suggestions.get(user.userId);
      if (cached && isCacheFresh(cached, locale, newestDigestAt)) {
        return { suggestions: cached.suggestions, personalised: true };
      }

      // No history: the static set is the right answer and not worth a model call.
      if (digested.length === 0) return defaults();

      const connectedSources = await getConnectedSourcesProvider().list();
      const projectPrompt = (await this.deps.settings.getSystemPrompt()) || undefined;
      const generate = this.deps.generate ?? ((c) => generateSuggestions(c));
      const generated = await generate({
        recentSummaries: digested.map((s) => ({
          title: s.title ?? 'Untitled',
          summary: s.summary ?? '',
        })),
        connectedSources,
        projectPrompt,
        locale,
      });
      if (!generated || generated.length === 0) return defaults();

      await this.deps.suggestions.set(user.userId, {
        suggestions: generated,
        generatedAt: Date.now(),
        locale,
        basedOn: digested.map((s) => s.id),
      });
      return { suggestions: generated, personalised: true };
    } catch (error) {
      logger.error('Failed to build suggestions', error);
      return defaults();
    }
  }
}
