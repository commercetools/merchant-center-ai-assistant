/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Export all agent prompts
 */
export { getCommercetoolsPrompt } from './commercetools.prompt';
export { getContentstackPrompt } from './contentstack.prompt';
export { getAlgoliaPrompt } from './algolia.prompt';
export { getStripePrompt } from './stripe.prompt';
export { getVisualizePrompt } from './visualize.prompt';
export { getBigqueryPrompt } from './bigquery.prompt';
export { getExportPrompt } from './export.prompt';
export { getImageGenerationPrompt } from './image-generation.prompt';

// Also export base utilities for custom prompts
export * from './base.prompt';
