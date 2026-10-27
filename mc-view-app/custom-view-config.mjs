/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * @type {import('@commercetools-frontend/application-config').ConfigOptionsForCustomView}
 */
const config = {
  name: 'AI Assistant',
  cloudIdentifier: '${env:CLOUD_IDENTIFIER}',
  env: {
    production: {
      customViewId: '${env:CUSTOM_VIEW_ID}',
      url: '${env:APPLICATION_URL}',
    },
    development: {
      // Dev only (`yarn start`). Read from process.env instead of a placeholder so that the
      // production build, where Connect does not provide it, does not fail.
      initialProjectKey: process.env.INITIAL_PROJECT_KEY || 'unset-dev-only',
      // Dev only: the Merchant Center page the view is mounted on by `yarn start`.
      hostUriPath: process.env.HOST_URI_PATH || '/unset-dev-only/categories',
    },
  },
  additionalEnv: {
    chatServiceEndpointUrl: '${env:CHAT_SERVICE_ENDPOINT_URL}',
  },
  // Default View/Manage pair only: no permission group and no extra scopes.
  // - *_key_value_documents: unused by this view (every call goes through the gateway), but
  //   the lists must be non-empty and changing scopes re-registers the Custom View.
  // - *_mcp_servers: parity with mc-app. The panel never lists, creates or binds servers.
  oAuthScopes: {
    view: ['view_key_value_documents', 'view_mcp_servers'],
    manage: ['manage_key_value_documents', 'manage_mcp_servers'],
  },
  type: 'CustomPanel',
  typeSettings: {
    size: 'SMALL',
  },
  headers: {
    csp: {
      // The browser never contacts the service directly: every call goes through the
      // Merchant Center API's /proxy/forward-to, whose origin app-kit already allows.
      // No 'unsafe-eval': the view has no generated-code renderer.
      'connect-src': ['*.commercetools.app', '*.gstatic.com'],
      'script-src': ['*.commercetools.app', '*.gstatic.com', "'unsafe-inline'"],
      'img-src': ['*.gstatic.com', 'blob:'],
      'font-src': ['*.gstatic.com'],
      'style-src': ['*.gstatic.com'],
    },
  },
  // The 65 locators of the view, in this order (do not reorder).
  locators: [
    'categories',
    'categories.category_details.external_search',
    'categories.category_details.general',
    'categories.category_details.products',
    'categories.category_products.manage_storefront_order',
    'customers',
    'customers.add_business_unit.business_unit_details',
    'customers.business_unit_addresses.edit_address',
    'customers.business_unit_addresses.new_address',
    'customers.business_unit_associates.edit_associate',
    'customers.business_unit_associates.new_associate',
    'customers.business_unit_details.addresses',
    'customers.business_unit_details.associates',
    'customers.business_unit_details.general',
    'customers.business_unit_details.orders',
    'customers.customer_addresses.edit_adress',
    'customers.customer_addresses.new_address',
    'customers.customer_details.addresses',
    'customers.customer_details.business_units',
    'customers.customer_details.general',
    'customers.customer_details.orders',
    'customers.customer_orders.order_detail',
    'discounts',
    'discounts.add_discount.general',
    'discounts.cart_discount_details.custom_fields',
    'discounts.cart_discount_details.general',
    'discounts.discount_code_details.custom_fields',
    'discounts.discount_code_details.general',
    'discounts.generate_discount_codes',
    'discounts.product_discount_details.general',
    'operations',
    'operations.import_log_details',
    'orders',
    'orders.order_details.general',
    'orders.order_details.payments',
    'orders.order_details.returns',
    'orders.order_details.shipping_and_delivery',
    'orders.order_returns.create_return',
    'orders.order_returns.edit_return',
    'orders.order_shipping_and_delivery.add_parcel',
    'orders.order_shipping_and_delivery.create_delivery',
    'orders.order_shipping_and_delivery.edit_delivery',
    'orders.quotes.drafts',
    'orders.quotes.final',
    'orders.quotes.requests',
    'products',
    'products.product_details.general',
    'products.product_details.search',
    'products.product_details.selections',
    'products.product_details.variants',
    'products.product_variant_details.general',
    'products.product_variant_details.images',
    'products.product_variant_details.inventory',
    'products.product_variant_details.inventory.details',
    'products.product_variant_details.inventory.details.add_inventory',
    'products.product_variant_details.prices',
    'products.product_variant_details.prices.edit_price',
    'products.product_variant_images.add_image',
    'products.product_variant_prices.add_price',
    'settings',
    'settings.project.channel_details',
    'settings.project.store_details',
    'standalone_prices',
    'standalone_prices.add_standalone_price',
    'standalone_prices.standalone_price_details',
  ],
};

export default config;
