/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

export const STRIPE_SOURCE_NAME = 'stripe';

/** Tools menu entries that create or change Stripe data (`resource.action`). */
export const STRIPE_UPDATE_TOOLS: readonly string[] = [
  'coupons.create',
  'customers.create',
  'disputes.update',
  'invoices.create',
  'invoiceItems.create',
  'paymentLinks.create',
  'prices.create',
  'products.create',
  'refunds.create',
  'subscriptions.create',
  'subscriptions.update',
];

/** Tools menu entries that only read Stripe data. */
export const STRIPE_READ_TOOLS: readonly string[] = [
  'balance.read',
  'coupons.read',
  'customers.read',
  'disputes.read',
  'documentation.read',
  'invoices.read',
  'invoiceItems.read',
  'paymentIntents.read',
  'paymentLinks.read',
  'prices.read',
  'products.read',
  'refunds.read',
  'subscriptions.read',
];

/** The 24 menu names (11 update + 13 read). */
export const STRIPE_TOOLS: readonly string[] = [
  ...STRIPE_UPDATE_TOOLS,
  ...STRIPE_READ_TOOLS,
];

/**
 * Names under which the model sees the tools of `@stripe/agent-toolkit@0.7.12`.
 *
 * The toolkit keys its tools by function (`create_customer`) but the tools menu, the
 * session switches and the registry's filter speak `resource.action`. The key of every tool
 * is therefore rewritten to the menu name, so a switched-off menu entry really removes the
 * tool. The version is pinned exactly; a test asserts every key the real toolkit returns is
 * in this map (an unknown key is dropped with a warning, never exposed unswitchable).
 *
 * `cancel_subscription` is not a menu entry of its own: the toolkit ships it together with
 * `subscriptions.update` (a mutating call), so it follows that switch (see `source.ts`).
 */
export const STRIPE_TOOL_NAME_BY_KEY: Readonly<Record<string, string>> = {
  create_coupon: 'coupons.create',
  create_customer: 'customers.create',
  update_dispute: 'disputes.update',
  create_invoice: 'invoices.create',
  create_invoice_item: 'invoiceItems.create',
  create_payment_link: 'paymentLinks.create',
  create_price: 'prices.create',
  create_product: 'products.create',
  create_refund: 'refunds.create',
  update_subscription: 'subscriptions.update',
  cancel_subscription: 'subscriptions.cancel',
  retrieve_balance: 'balance.read',
  list_coupons: 'coupons.read',
  list_customers: 'customers.read',
  list_disputes: 'disputes.read',
  search_stripe_documentation: 'documentation.read',
  list_invoices: 'invoices.read',
  list_payment_intents: 'paymentIntents.read',
  list_prices: 'prices.read',
  list_products: 'products.read',
  list_subscriptions: 'subscriptions.read',
};

/** Tool that follows the switch of another menu entry. */
export const STRIPE_FOLLOWS: Readonly<Record<string, string>> = {
  'subscriptions.cancel': 'subscriptions.update',
};
