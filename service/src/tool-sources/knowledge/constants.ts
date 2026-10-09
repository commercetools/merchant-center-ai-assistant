/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** Source name = tools-menu group = key of `disabledTools`. Contract with change H's
 * custom-view orchestrator and the stored session switches: do not rename. */
export const KNOWLEDGE_SOURCE_NAME = 'commercetools-knowledge';

/** Public, unauthenticated, fixed on purpose: never make this configurable. */
export const KNOWLEDGE_MCP_URL = 'https://docs.commercetools.com/apis/mcp';

/** The prompt exposed by the server that carries commercetools API conventions. */
export const DEVELOPER_TIPS_PROMPT = 'commercetools-developer-tips';

/** Tools the server is expected to serve; used for drift warnings and the menu fallback. */
export const KNOWLEDGE_TOOLS: readonly string[] = [
  'commercetools-documentation-search',
  'commercetools-documentation-by-id',
  'commercetools-graphql-schemata',
  'commercetools-oas-schemata',
  'commercetools-graphql-validate',
  'commercetools-rest-validate',
];

/** Developer tips are refreshed every 30 minutes. */
export const TIPS_TTL_MS = 30 * 60 * 1000;

/** The menu must render quickly even when the endpoint is down. */
export const MENU_HANDSHAKE_TIMEOUT_MS = 3000;
