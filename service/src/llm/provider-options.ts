/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { generateText } from 'ai';
import { readConfiguration } from '../config';
import type { ModelTier } from './models';

/** The AI SDK's provider-options type (not exported by `ai` under its own name). */
type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>;

/**
 * Thinking configuration per tier, under the `vertex` namespace. Stored messages
 * written under the legacy `google` namespace stay readable: the provider reads
 * `googleVertex`, then `vertex`, then `google`.
 */
export function getProviderOptions(tier: ModelTier): ProviderOptions | undefined {
  switch (tier) {
    case 'main':
      return { vertex: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } } };
    case 'agent':
      // thinkingBudget is a 2.5-era control: it is only valid while the `agent`
      // model (default gemini-2.5-flash) is a 2.5 model; Gemini 3.x ignores or rejects it.
      return { vertex: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } } };
    case 'lite':
      // No includeThoughts on purpose: with thoughts on, the digest and suggestion calls
      // were measured at over a thousand reasoning tokens and a multi-second cold start.
      return {
        vertex: { thinkingConfig: { thinkingLevel: readConfiguration().llm.liteThinkingLevel } },
      };
    case 'image':
      // Deliberately none: image-model options (aspectRatio, personGeneration) are not
      // language-model options and were silently stripped by the provider in the legacy code.
      return undefined;
  }
}
