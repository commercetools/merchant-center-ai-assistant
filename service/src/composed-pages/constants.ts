/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Tool name; listed in H's STORABLE_TOOLS, so it MUST NOT change. */
export const CREATE_COMPOSED_PAGE_TOOL = 'create_composed_page';

/** Owned by change L; referenced by name only. */
export const QUERY_AGGREGATED_DATA_TOOL = 'query_aggregated_data';

/** Tool source name (H's agent key). */
export const COMPOSED_PAGE_SOURCE_NAME = 'commercetoolsUI';

/** The Nimbus documentation tools (change K) the prompt may mention. */
export const NIMBUS_LOOKUP_TOOLS = {
  listComponents: 'list_components',
  getComponents: 'get_components',
  getTokens: 'get_tokens',
  searchIcons: 'search_icons',
  searchDocs: 'search_docs',
  getDocsPage: 'get_docs_page',
  migrateFromUikit: 'migrate_from_uikit',
} as const;
