/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { z } from 'zod';
import {
  ENTITY_URL_MAPPING,
  buildEntityUrl,
  getEntityLabel,
  getSupportedEntityTypes,
} from './entity-url-mapping';

export const CREATE_ENTITY_LINK_TOOL = 'create_entity_link';

/**
 * Entity types enum derived from the mapping
 */
const EntityType = z.enum([
  'product',
  'product-variant',
  'order',
  'customer',
  'category',
  'cart',
  'product-discount',
  'cart-discount',
  'discount-code',
  'inventory',
  'channel',
  'customer-group',
  'product-type',
  'tax-category',
  'zone',
  'shipping-method',
  'store',
]);

/**
 * Single link definition
 */
const EntityLinkSchema = z.object({
  entityType: EntityType.describe(
    'The type of commercetools entity to link to'
  ),
  id: z.string().describe('The unique identifier of the entity'),
  variantId: z
    .string()
    .optional()
    .describe('The variant ID (required only for product-variant entity type)'),
  displayText: z
    .string()
    .describe(
      'The text to display for the link (e.g., product name, order number)'
    ),
});

/**
 * Input schema for the entity link tool - projectKey is injected automatically
 */
const createEntityLinkSchema = z.object({
  links: z
    .array(EntityLinkSchema)
    .min(1)
    .describe('Array of entity links to create'),
});

/**
 * Single link output structure
 */
interface EntityLinkOutput {
  entityType: string;
  entityLabel: string;
  id: string;
  variantId?: string;
  displayText: string;
  url: string;
}

/**
 * Output structure for the entity link tool
 */
interface EntityLinkToolOutput {
  success: true;
  links: EntityLinkOutput[];
}

interface EntityLinkToolError {
  success: false;
  error: string;
  hint: string;
}

type EntityLinkResult = EntityLinkToolOutput | EntityLinkToolError;

/**
 * Factory function to create the entity link tool with projectKey injected
 */
export const createEntityLinkToolFactory = (projectKey: string) => ({
  description: `Create hyperlinks to commercetools entities that will be rendered as clickable links in the chat interface.

WHEN TO USE:
- ALWAYS Use when you retrieved data from a commercetools entity that is supported.
- Use when the user asks about or references entities by ID or name
- Creates clickable links that navigate to the entity in the Merchant Center

SUPPORTED ENTITY TYPES:
${getSupportedEntityTypes()
  .map((type) => `- ${type}: ${ENTITY_URL_MAPPING[type].label}`)
  .join('\n')}

IMPORTANT:
- The projectKey is automatically injected - you don't need to provide it
- Final URLs are relative. Do not include the base URL in the URL.
- Always provide meaningful displayText (e.g., product name, order number)
- For product-variant, you must provide both id (product ID) and variantId
- Multiple links can be created in a single call

EXAMPLE:
{
  "links": [
    { "entityType": "product", "id": "abc123", "displayText": "Red Running Shoes" },
    { "entityType": "order", "id": "order-456", "displayText": "Order #12345" }
  ]
}`,

  inputSchema: createEntityLinkSchema,

  execute: async ({
    links,
  }: z.infer<typeof createEntityLinkSchema>): Promise<string> => {
    try {
      const outputLinks: EntityLinkOutput[] = [];

      for (const link of links) {
        const params: Record<string, string> = {
          projectKey,
          id: link.id,
        };

        // Add variantId if provided
        if (link.variantId) {
          params.variantId = link.variantId;
        }

        // Validate that product-variant has variantId
        if (link.entityType === 'product-variant' && !link.variantId) {
          return JSON.stringify({
            success: false,
            error: `Missing variantId for product-variant entity with id: ${link.id}`,
            hint: 'When creating a link to a product variant, you must provide both the product id and the variantId.',
          });
        }

        const url = buildEntityUrl(link.entityType, params);

        if (!url) {
          return JSON.stringify({
            success: false,
            error: `Failed to build URL for entity type: ${link.entityType}`,
            hint: `Ensure the entity type is supported and all required parameters are provided. Supported types: ${getSupportedEntityTypes().join(', ')}`,
          });
        }

        outputLinks.push({
          entityType: link.entityType,
          entityLabel: getEntityLabel(link.entityType),
          id: link.id,
          variantId: link.variantId,
          displayText: link.displayText,
          url,
        });
      }

      return JSON.stringify({
        success: true,
        links: outputLinks,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return JSON.stringify({
        success: false,
        error: `Entity link creation failed: ${errorMessage}`,
        hint: 'Check that all required parameters are provided and entity types are valid.',
      });
    }
  },
});
