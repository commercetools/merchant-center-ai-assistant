/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Model layer (Gemini on Vertex AI). Contract used by the agents, the chat orchestrator and the
 * tool sources:
 * - `getModel(tier)`: Vertex language model for `main` | `lite` | `image`
 *   (orchestrator, commercetools-facing agents, and algolia, stripe, export and contentstack
 *   agents use `main`; digest, suggestions and analyzer use `lite`; the image agent uses
 *   `image`).
 * - `getModelName(tier)`: the resolved model id.
 * - `getProviderOptions(tier)`: thinking configuration (`undefined` for `image`).
 * - `countTokens(text, tier?)`: token count, `0` when unknown.
 */
export { getModel, getModelName, resetLlmForTests } from './models';
export type { ModelTier } from './models';
export { getProviderOptions } from './provider-options';
export { countTokens, resetCountTokensForTests } from './count-tokens';
