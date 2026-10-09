/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import {
  getBaseRules,
  getProjectSystemPromptSection,
  getReturnFormatSection,
} from '../agents/prompts';
import type { ToolSourceRegistry } from '../tool-sources/registry';
import type { ToolContext } from '../tool-sources/types';
import { logger } from '../utils/logger.utils';
import { createChatAgent, type BuiltAgent } from './orchestrator';

/** The only sources a custom-view session may use (it answers about one entity). */
export const CUSTOM_VIEW_SOURCES = ['commercetools', 'commercetools-knowledge'] as const;

/** Longest decoded URL put into the instructions. */
const MAX_CUSTOM_VIEW_URL_CHARS = 2000;

const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * `featureFlags.customView` is the base64 Merchant Center URL of the page the panel sits on.
 * A missing or non-base64 value is logged and treated as an empty URL: it must never crash
 * the turn.
 */
export const decodeCustomView = (value: unknown): string => {
  if (typeof value !== 'string' || value === '') {
    logger.warn('Custom view URL not found on the session');
    return '';
  }
  if (!BASE64.test(value)) {
    logger.warn('Custom view URL is not valid base64; using an empty URL');
    return '';
  }
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  return decoded.slice(0, MAX_CUSTOM_VIEW_URL_CHARS);
};

export const buildCustomViewInstructions = (
  ctx: ToolContext,
  customViewUrl: string
): string => `
You are a helpful assistant in commercetools merchant center.
You are currently in a custom view with the following URL: ${customViewUrl}.

The URL above is in the following format /<projectKey>/<entityType 1>/<entityId 1>/<entityType 2>/<entityId 2>/.../<entityType n>/<entityId n>

Examples:
/ct-test/products/123/variants/456 => Product ID: 123, VariantID: 456
/ct-test/products/123/variants/456/prices => Product ID: 123, VariantID: 456, viewing Prices
/ct-test/products/333/product-selections => Product ID: 333, viewing Product Selections
/ct-test/orders/123 => Order ID: 123

Extract the entity types and IDs from the URL and use them to help the user.

## YOUR ROLE
You handle all commercetools platform operations including:
- Products and product catalog management
- Orders and order processing
- Customers and customer groups
- Shopping carts and checkout
- Inventory and stock management
- Discounts, promotions, and pricing
- Categories and product organization
- Shipping and tax configuration
- API documentation, schema lookups, and developer resources

## CAPABILITIES
- Query and search products with filters and facets
- Read and manage orders (view, update status, etc.)
- Access customer information and history
- Work with shopping carts
- Manage inventory levels
- Handle discount codes and promotions
- Search and retrieve API documentation
- Explain data structures and schemas
- Help troubleshoot API errors and guide proper tool usage


${getBaseRules(ctx.locale)}

<tool_specific_rules>
  1. Calling search_products always requires the "productProjectionParameters" parameter to be set.
  2. When calling search_products, it's better to use "fuzzy" or "wildcard" instead of "fullText" search for terms.
  3. If a tool call fails, use the documentation tools directly to look up correct usage.
</tool_specific_rules>

<documentation_guidance>
  When looking up documentation:
  - Use input parameter for the tool or operation name
  - Set contentTypes to "userDocs" for human-readable documentation
  - Set products to "Composable Commerce" for commercetools API docs

  Example lookup for failed tool:
  - commercetools-documentation with input="search_products filters", contentTypes="userDocs"
</documentation_guidance>

${getReturnFormatSection()}

## WHAT YOU CANNOT DO:
- Visualize data. Just return the data in a readable format.
- Export data. Just return the data in a readable format.
- Perform SQL queries. Just return the data in a readable format.
- Analyze data. Just return the data in a readable format.

${getProjectSystemPromptSection(ctx.projectSystemPrompt)}
`;

/**
 * The orchestrator of a custom-view session (capability agent-orchestration).
 *
 * Same time budget and loop settings as the default orchestrator, but only the
 * `commercetools` and `commercetools-knowledge` sources and entity-specific prose. The
 * project system prompt is injected once (legacy: not at all).
 */
export const buildCustomViewOrchestrator = async (
  ctx: ToolContext,
  registry: ToolSourceRegistry
): Promise<BuiltAgent> => {
  const customViewUrl = decodeCustomView(ctx.session.featureFlags?.customView);
  const { tools } = await registry.resolve(ctx, { only: CUSTOM_VIEW_SOURCES });
  return createChatAgent({
    ctx,
    instructions: buildCustomViewInstructions(ctx, customViewUrl),
    tools,
  });
};
