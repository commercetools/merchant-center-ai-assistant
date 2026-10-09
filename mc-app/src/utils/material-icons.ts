/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ComponentType, SVGProps } from 'react';
import {
  Article,
  AutoAwesome,
  BarChart,
  Build,
  Campaign,
  Category,
  CreditCard,
  DashboardCustomize,
  Description,
  Discount,
  Download,
  Group,
  Image,
  Insights,
  Inventory2,
  Language,
  LocalOffer,
  LocalShipping,
  ManageSearch,
  Payments,
  Percent,
  PieChart,
  Person,
  QueryStats,
  ReceiptLong,
  Search,
  Sell,
  ShoppingCart,
  ShowChart,
  Storefront,
  TableChart,
  TrendingDown,
  TrendingUp,
} from '@commercetools/nimbus-icons';

/**
 * The icon vocabulary the router may choose from when it describes a session or a suggested
 * prompt.
 *
 * Names are Material Symbols in snake_case, which is what the design specifies and what the
 * model is asked to emit; `@commercetools/nimbus-icons` exports the same Material set in
 * PascalCase, so the mapping below is purely mechanical.
 *
 * This list is deliberately short and domain-flavoured. A model given all 2,123 Material
 * icons picks badly and unpredictably; a curated set keeps the session list visually
 * coherent. It is mirrored on the server as `DIGEST_ICON_NAMES` in the router's
 * `src/constants.ts`, where it is enforced as a zod enum - the two lists must be changed
 * together, and anything unrecognised falls back to `auto_awesome` here regardless.
 *
 * Chrome icons used by the redesign's own layout (menus, chevrons, send arrows) are NOT in
 * here. Components import those from `@commercetools/nimbus-icons` directly; this map exists
 * only for names that arrive as data.
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
  // Generic, and the fallback
  'auto_awesome',
] as const;

export type DigestIconName = (typeof DIGEST_ICON_NAMES)[number];

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ICONS: Record<DigestIconName, IconComponent> = {
  inventory_2: Inventory2,
  category: Category,
  storefront: Storefront,
  receipt_long: ReceiptLong,
  shopping_cart: ShoppingCart,
  local_shipping: LocalShipping,
  person: Person,
  group: Group,
  sell: Sell,
  percent: Percent,
  local_offer: LocalOffer,
  discount: Discount,
  campaign: Campaign,
  credit_card: CreditCard,
  payments: Payments,
  trending_up: TrendingUp,
  trending_down: TrendingDown,
  show_chart: ShowChart,
  bar_chart: BarChart,
  pie_chart: PieChart,
  query_stats: QueryStats,
  insights: Insights,
  table_chart: TableChart,
  description: Description,
  article: Article,
  image: Image,
  search: Search,
  manage_search: ManageSearch,
  dashboard_customize: DashboardCustomize,
  language: Language,
  build: Build,
  download: Download,
  auto_awesome: AutoAwesome,
};

/** The icon every unrecognised or missing name resolves to. */
export const FALLBACK_ICON: IconComponent = AutoAwesome;

const isDigestIconName = (name: string): name is DigestIconName =>
  Object.prototype.hasOwnProperty.call(ICONS, name);

/**
 * Resolve an icon name that arrived as data into a component.
 *
 * Never throws and never renders nothing: an unknown name, an empty string or `undefined`
 * all yield the fallback sparkle. The server is free to widen its enum before this map
 * catches up.
 */
export const iconFor = (name?: string | null): IconComponent => {
  if (!name) return FALLBACK_ICON;
  return isDigestIconName(name) ? ICONS[name] : FALLBACK_ICON;
};
