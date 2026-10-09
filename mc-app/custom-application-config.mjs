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
  name: 'AI Assistant',
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
  additionalEnv: {
    chatServiceEndpointUrl: '${env:CHAT_SERVICE_ENDPOINT_URL}',
  },
  headers: {
    csp: {
      // The browser never contacts the service directly: every call goes through the
      // Merchant Center API's /proxy/forward-to, whose origin app-kit already allows.
      'connect-src': ['*.commercetools.app', '*.gstatic.com'],
      // 'unsafe-eval' is needed by the generated-page renderer (change P).
      'script-src': [
        '*.commercetools.app',
        '*.gstatic.com',
        "'unsafe-inline'",
        "'unsafe-eval'",
      ],
      'img-src': ['*.gstatic.com', '*.gravatar.com', 'gravatar.com', 'blob:'],
      'font-src': ['*.gstatic.com'],
      'style-src': ['*.gstatic.com'],
    },
  },
  // Default View/Manage permission pair only (no custom permission, no additionalOAuthScopes).
  // Generated pages query and mutate commerce data through the Merchant Center GraphQL
  // proxy, so the commerce scopes below have a consumer. view_mcp_servers and
  // manage_mcp_servers list and create Managed MCP servers with the signed-in user's own
  // permissions; the service still decides who is an administrator (ADMIN_USER_IDS).
  oAuthScopes: {
    view: [
      'view_key_value_documents',
      'view_mcp_servers',
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
      'manage_key_value_documents',
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
      'manage_mcp_servers',
      'manage_approval_flows',
      'manage_approval_rules',
      'manage_associate_roles',
      'manage_attribute_groups',
      'manage_discount_codes',
      'manage_project_settings',
      'manage_order_edits',
      'manage_payments',
      'manage_recurring_orders',
      'manage_recurring_payments',
      'manage_recurrence_policies',
      'manage_states',
      'manage_types',
    ],
  },
  icon: '${path:@tabler/icons/outline/robot.svg}',
  mainMenuLink: {
    defaultLabel: 'AI Assistant',
    labelAllLocales: [],
    permissions: [PERMISSIONS.View],
  },
};

export default config;
