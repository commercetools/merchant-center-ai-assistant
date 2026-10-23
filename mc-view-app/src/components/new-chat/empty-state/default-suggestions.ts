/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { PromptSuggestion } from '../../../hooks/use-chat-service-connector/types';

/**
 * What a user sees before the assistant knows anything about them.
 *
 * Shown on a first visit, when the suggestions endpoint is unavailable, and whenever
 * personalisation is switched off. They are deliberately four different KINDS of task -
 * analysis, a change, a lookup, a build - rather than four variations on one, because their
 * job on a blank screen is to show the range of what can be asked, not to guess correctly.
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
    prompt:
      'Draft a 15% discount for my best selling product, ending next Sunday.',
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
    detail: 'Turn an answer into a shareable page for your colleagues.',
    prompt: 'Build a page showing product sales trends for the last quarter.',
  },
];

/**
 * The client's own copy of the defaults exists because the empty state must render four
 * cards even when the suggestions endpoint is unreachable. The service has a matching set
 * in `suggestions.service.ts` for the cases it can answer.
 */
