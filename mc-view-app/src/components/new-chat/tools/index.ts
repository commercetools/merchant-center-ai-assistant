/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export const VISUALIZE_DATA_TOOL = 'visualize_data';
export const EXPORT_DATA_TOOL = 'export_data';

// Tools that have custom rendering
export const CUSTOM_RENDERED_TOOLS = [VISUALIZE_DATA_TOOL, EXPORT_DATA_TOOL];

// Subagent tools - their output is a UIMessage with nested parts
export const SUBAGENT_TOOLS = [
  'commercetools',
  'contentstack',
  'algolia',
  'stripe',
  'commercetoolsUI',
  'visualize',
  'bigquery',
  'export',
  'imageGeneration',
];
