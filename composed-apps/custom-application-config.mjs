/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { PERMISSIONS } from './src/constants';

/**
 * @type {import('@commercetools-frontend/application-config').ConfigOptionsForCustomApplication}
 */
const config = {
  name: 'AI Assistant Pages',
  entryPointUriPath: '${env:ENTRY_POINT_URI_PATH}',
  cloudIdentifier: '${env:CLOUD_IDENTIFIER}',
  env: {
    production: {
      applicationId: '${env:CUSTOM_APPLICATION_ID}',
      url: '${env:APPLICATION_URL}',
    },
    development: {
      // Dev only (`yarn start`). Read from process.env instead of a placeholder so that the
      // production build, where Connect does not provide it, does not fail.
      initialProjectKey: process.env.INITIAL_PROJECT_KEY || 'unset-dev-only',
    },
  },
  headers: {
    csp: {
      // The app makes no service calls: pages are read through the Merchant Center API.
      'connect-src': ['*.commercetools.app', '*.gstatic.com'],
      // 'unsafe-eval' (and 'unsafe-inline') are needed only because the renderer executes
      // the generated page code with `new Function`.
      'script-src': [
        '*.commercetools.app',
        '*.gstatic.com',
        "'unsafe-inline'",
        "'unsafe-eval'",
      ],
      'img-src': ['*.gstatic.com'],
      'font-src': ['*.gstatic.com'],
      'style-src': ['*.gstatic.com'],
    },
  },
  // Default View/Manage permission pair only (no custom permission, no additionalOAuthScopes).
  // Stored pages run arbitrary GraphQL through the Merchant Center proxy with the signed-in
  // user's token: the view_* scopes back their queries, the manage_* scopes back the UI-action
  // mutations a generated page may declare. view_key_value_documents reads the pages
  // themselves; this app never writes them, so there is no manage_key_value_documents.
  // No MCP scopes: the app has no Managed MCP surface.
  oAuthScopes: {
    view: [
      'view_key_value_documents',
      'view_stores',
      'view_tax_categories',
      'view_products',
      'view_product_selections',
      'view_categories',
      'view_standalone_prices',
      'view_cart_discounts',
      'view_discount_codes',
      'view_customers',
      'view_customer_groups',
      'view_business_units',
      'view_orders',
      'view_payment_methods',
      'view_shopping_lists',
      'view_shipping_methods',
      'view_quote_requests',
      'view_staged_quotes',
      'view_quotes',
    ],
    manage: [
      'manage_stores',
      'manage_tax_categories',
      'manage_products',
      'manage_product_selections',
      'manage_categories',
      'manage_standalone_prices',
      'manage_cart_discounts',
      'manage_customers',
      'manage_customer_groups',
      'manage_business_units',
      'manage_orders',
      'manage_payment_methods',
      'manage_shopping_lists',
      'manage_shipping_methods',
      'manage_quote_requests',
      'manage_staged_quotes',
      'manage_quotes',
    ],
  },
  icon: '${path:@tabler/icons/outline/message-chatbot.svg}',
  mainMenuLink: {
    defaultLabel: 'AI Assistant Pages',
    labelAllLocales: [],
    permissions: [PERMISSIONS.View],
  },
};

export default config;
