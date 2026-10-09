/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Model layer (Gemini on Vertex AI). Contract used by specs G, H and L:
 * - `getModel(tier)`: Vertex language model for `main` | `agent` | `lite` | `image`
 *   (orchestrator and commercetools-facing agents use `main`; algolia, stripe, export and
 *   contentstack agents use `agent`; digest, suggestions and analyzer use `lite`;
 *   the image agent uses `image`).
 * - `getModelName(tier)`: the resolved model id.
 * - `getProviderOptions(tier)`: thinking configuration (`undefined` for `image`).
 * - `countTokens(text, tier?)`: token count, `0` when unknown.
 */
export { getModel, getModelName, resetLlmForTests } from './models';
export type { ModelTier } from './models';
export { getProviderOptions } from './provider-options';
export { countTokens, resetCountTokensForTests } from './count-tokens';
