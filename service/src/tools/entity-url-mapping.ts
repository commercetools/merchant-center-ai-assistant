/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Entity URL Mapping Configuration
 *
 * This file contains the URL patterns for different commercetools entities.
 * URLs are relative to the Merchant Center base URL.
 *
 * Placeholders:
 * - {projectKey}: The project key
 * - {id}: The entity ID
 * - {variantId}: The variant ID (for product variants)
 */

export interface EntityUrlPattern {
  /** Human-readable name of the entity type */
  label: string;
  /** URL pattern with placeholders */
  pattern: string;
  /** Required parameters for this entity type */
  requiredParams: string[];
}

/**
 * Mapping of entity types to their URL patterns
 */
export const ENTITY_URL_MAPPING: Record<string, EntityUrlPattern> = {
  product: {
    label: 'Product',
    pattern: '/{projectKey}/products/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'product-variant': {
    label: 'Product Variant',
    pattern: '/{projectKey}/products/{id}/variants/{variantId}',
    requiredParams: ['projectKey', 'id', 'variantId'],
  },
  order: {
    label: 'Order',
    pattern: '/{projectKey}/orders/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  customer: {
    label: 'Customer',
    pattern: '/{projectKey}/customers/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  category: {
    label: 'Category',
    pattern: '/{projectKey}/categories/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  cart: {
    label: 'Cart',
    pattern: '/{projectKey}/orders/carts/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'product-discount': {
    label: 'Product Discount',
    pattern: '/{projectKey}/discounts/products/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'cart-discount': {
    label: 'Cart Discount',
    pattern: '/{projectKey}/discounts/carts/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'discount-code': {
    label: 'Discount Code',
    pattern: '/{projectKey}/discounts/codes/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  inventory: {
    label: 'Inventory',
    pattern: '/{projectKey}/inventory/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  channel: {
    label: 'Channel',
    pattern: '/{projectKey}/settings/channels/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'customer-group': {
    label: 'Customer Group',
    pattern: '/{projectKey}/settings/customer-groups/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'product-type': {
    label: 'Product Type',
    pattern: '/{projectKey}/settings/product-types/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'tax-category': {
    label: 'Tax Category',
    pattern: '/{projectKey}/settings/taxes/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  zone: {
    label: 'Zone',
    pattern: '/{projectKey}/settings/zones/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  'shipping-method': {
    label: 'Shipping Method',
    pattern: '/{projectKey}/settings/shipping-methods/{id}',
    requiredParams: ['projectKey', 'id'],
  },
  store: {
    label: 'Store',
    pattern: '/{projectKey}/settings/stores/{id}',
    requiredParams: ['projectKey', 'id'],
  },
};

/**
 * Get all supported entity types
 */
export const getSupportedEntityTypes = (): string[] => {
  return Object.keys(ENTITY_URL_MAPPING);
};

/**
 * Build a URL from an entity type and parameters
 */
export const buildEntityUrl = (
  entityType: string,
  params: Record<string, string>
): string | null => {
  const mapping = ENTITY_URL_MAPPING[entityType];
  if (!mapping) {
    return null;
  }

  // Check all required params are present
  for (const param of mapping.requiredParams) {
    if (!params[param]) {
      return null;
    }
  }

  // Build the URL by replacing placeholders
  let url = mapping.pattern;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, value);
  }

  return url;
};

/**
 * Get the label for an entity type
 */
export const getEntityLabel = (entityType: string): string => {
  return ENTITY_URL_MAPPING[entityType]?.label || entityType;
};
