/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { createVertex } from '@ai-sdk/google-vertex';
import { readConfiguration } from '../config';
import { getGoogleCredentials } from '../gcp/credentials';

/**
 * Model roles and their consumers:
 * - `main`:  orchestrator, custom-view agent, commercetools, commercetools-ui, visualize, bigquery
 *            agents, and the algolia, stripe, export and contentstack agents; all of them share
 *            the `main` model and its thinking level
 * - `lite`:  session-digest, suggestions, analyzer agents
 * - `image`: image-generation agent
 */
export type ModelTier = 'main' | 'lite' | 'image';

let provider: ReturnType<typeof createVertex> | undefined;

function vertex(): ReturnType<typeof createVertex> {
  if (!provider) {
    const c = getGoogleCredentials();
    provider = createVertex({
      project: c.projectId,
      location: c.location,
      googleAuthOptions: c.googleAuthOptions,
    });
  }
  return provider;
}

/** The resolved model id of a tier (each tier has its own configuration key). */
export function getModelName(tier: ModelTier): string {
  const { llm } = readConfiguration();
  return {
    main: llm.mainModel,
    lite: llm.liteModel,
    image: llm.imageModel,
  }[tier];
}

/**
 * A Vertex language model. The `image` tier is a *language* model with
 * multi-modal output: use it with `generateText` and read `result.files`.
 * Throws GcpNotConfiguredError when no service-account key is configured.
 */
export function getModel(tier: ModelTier) {
  return vertex().languageModel(getModelName(tier));
}

export function resetLlmForTests(): void {
  provider = undefined;
}
