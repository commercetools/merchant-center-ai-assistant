/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * The icon vocabulary the session digest and the prompt suggestions may choose from.
 *
 * Names are Material Symbols in snake_case. They are enforced as a zod enum wherever a model
 * produces one. Mirrored on the client in `mc-app/src/utils/material-icons.ts`, which falls
 * back to `auto_awesome` for anything it does not know: widening this list is safe ahead of
 * a client release, narrowing it is not.
 */
export const DIGEST_ICON_NAMES = [
  // Catalog
  'inventory_2',
  'category',
  'storefront',
  // Orders and fulfilment
  'receipt_long',
  'shopping_cart',
  'local_shipping',
  // Customers
  'person',
  'group',
  // Pricing and promotions
  'sell',
  'percent',
  'local_offer',
  'discount',
  'campaign',
  // Payments
  'credit_card',
  'payments',
  // Analytics
  'trending_up',
  'trending_down',
  'show_chart',
  'bar_chart',
  'pie_chart',
  'query_stats',
  'insights',
  'table_chart',
  // Content
  'description',
  'article',
  'image',
  // Search
  'search',
  'manage_search',
  // Pages and platform
  'dashboard_customize',
  'language',
  'build',
  'download',
  // Generic, and the fallback the client uses for anything unknown
  'auto_awesome',
] as const;

export type DigestIconName = (typeof DIGEST_ICON_NAMES)[number];

/** Used whenever a digest is missing or its icon cannot be trusted. */
export const DEFAULT_DIGEST_ICON: DigestIconName = 'auto_awesome';
