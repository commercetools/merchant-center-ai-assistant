/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { generateText, LanguageModel, Output } from 'ai';
import { z } from 'zod';
import { DIGEST_ICON_NAMES } from '../constants/digest-icons';
import { getModel, getProviderOptions } from '../llm';
import type { PromptSuggestion } from '../types/chat.types';
import { logger } from '../utils/logger.utils';
import { clamp, normaliseIcon } from './session-digest.agent';

export const WANTED_SUGGESTIONS = 4;
const SUGGESTIONS_TIMEOUT_MS = 15_000;

export const LIMITS = { title: 40, detail: 90, prompt: 200 } as const;

export const SuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        icon: z.enum(DIGEST_ICON_NAMES).describe('The icon that fits the task.'),
        title: z
          .string()
          .describe('The action, at most 5 words. Example: "Check recent orders".'),
        detail: z
          .string()
          .describe(
            'One short line, at most 90 characters, saying what it will do. Example: ' +
              '"Look up an order, its payment and fulfillment status."'
          ),
        prompt: z
          .string()
          .describe(
            'The message sent when the card is picked. It must stand alone as a first ' +
              'message, naming any entity or period it needs.'
          ),
      })
    )
    .describe(`Exactly ${WANTED_SUGGESTIONS} suggestions.`),
});

export type SuggestionsContext = {
  /** Titles and summaries of the user's most recent finished conversations. */
  recentSummaries: { title: string; summary: string }[];
  /** Which optional data sources this project has connected, e.g. contentstack, stripe. */
  connectedSources: string[];
  /** The project's custom system prompt, if it has one - it often states the domain. */
  projectPrompt?: string;
  locale: string;
};

const SYSTEM_PROMPT = `
You propose opening prompts for a commercetools Merchant Center assistant, shown as four
cards on an empty chat screen.

Their job is to get someone from a blank screen to a useful first question. That means:

- Four DIFFERENT KINDS of task, not four variations on one. Reach for a mix: an analysis, a
  change to draft, a lookup, something to build. Four ways of asking about orders is a
  failure even if all four are good.
- Grounded in what this user actually does. Their recent conversations are the strongest
  signal; continue or extend that work rather than repeating a question they already asked
  and had answered.
- Only about sources this project has connected. Never suggest content, search or payment
  work for a source that is not listed as available.
- Concrete. "Analyse my data" is useless; "Compare this month's revenue against target" is
  a question with an answer.
- Written in the user's voice, as their first message to the assistant.

Respect the length limits in each field description - these are cards in a narrow grid and
longer text is cut off.
`;

export const buildUserPrompt = (context: SuggestionsContext): string => {
  const lines: string[] = [];
  lines.push(`Locale for all output: ${context.locale}`);
  lines.push(
    `Data sources available: commercetools (always)${
      context.connectedSources.length ? `, ${context.connectedSources.join(', ')}` : ''
    }`
  );
  if (context.projectPrompt) {
    lines.push(`\nWhat this project is about:\n${context.projectPrompt}`);
  }
  if (context.recentSummaries.length > 0) {
    lines.push('\nThis user recently worked on:');
    context.recentSummaries.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry.title} - ${entry.summary}`);
    });
    lines.push('\nPropose what they would plausibly do next. Do not re-ask anything above.');
  } else {
    lines.push('\nThis user has no history yet. Show the range of what the assistant can do.');
  }
  return lines.join('\n');
};

const field = (entry: unknown, key: string): unknown =>
  typeof entry === 'object' && entry !== null
    ? (entry as Record<string, unknown>)[key]
    : undefined;

/** Clamp and filter a model response into cards that cannot break the grid. */
export const normaliseSuggestions = (raw: unknown): PromptSuggestion[] => {
  const list = field(raw, 'suggestions');
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => ({
      icon: normaliseIcon(field(entry, 'icon')),
      title: clamp(field(entry, 'title'), LIMITS.title),
      detail: clamp(field(entry, 'detail'), LIMITS.detail),
      prompt: clamp(field(entry, 'prompt'), LIMITS.prompt),
    }))
    .filter((entry) => entry.title && entry.prompt)
    .slice(0, WANTED_SUGGESTIONS);
};

/**
 * Generates personalised opening prompts. Returns `null` on any failure; the caller falls
 * back to the static set, so the empty state is never blank and never an error.
 */
export const generateSuggestions = async (
  context: SuggestionsContext,
  model?: LanguageModel
): Promise<PromptSuggestion[] | null> => {
  try {
    const result = await generateText({
      model: model ?? getModel('lite'),
      output: Output.object({ schema: SuggestionsSchema }),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(context),
      providerOptions: getProviderOptions('lite'),
      abortSignal: AbortSignal.timeout(SUGGESTIONS_TIMEOUT_MS),
    });
    const suggestions = normaliseSuggestions(result.output);
    return suggestions.length > 0 ? suggestions : null;
  } catch (error) {
    logger.warn('Prompt suggestion generation failed', error);
    return null;
  }
};
