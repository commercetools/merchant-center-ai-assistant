/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { isRecord } from './session';

export interface PromptSuggestion {
  icon: string;
  title: string;
  detail: string;
  prompt: string;
}

/** A user's cached prompt suggestions. Cache only: safe to lose. */
export interface UserSuggestions {
  suggestions: PromptSuggestion[];
  generatedAt: number;
  locale: string;
  /** Session ids whose summaries shaped these. */
  basedOn: string[];
}

export function suggestionFromValue(v: unknown): UserSuggestions | null {
  if (!isRecord(v) || !Array.isArray(v.suggestions)) return null;
  return {
    suggestions: v.suggestions as PromptSuggestion[],
    generatedAt: typeof v.generatedAt === 'number' ? v.generatedAt : 0,
    locale: typeof v.locale === 'string' ? v.locale : '',
    basedOn: Array.isArray(v.basedOn) ? (v.basedOn as string[]) : [],
  };
}
