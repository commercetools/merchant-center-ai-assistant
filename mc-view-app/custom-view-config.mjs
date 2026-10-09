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
      initialProjectKey: '${env:INITIAL_PROJECT_KEY}',
      hostUriPath: '/${env:INITIAL_PROJECT_KEY}/products',
    },
  },
  additionalEnv: {
    chatServiceEndpointUrl: '${env:CHAT_SERVICE_ENDPOINT_URL}',
  },
  // Default View/Manage pair only (no custom permission, no additionalOAuthScopes).
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
      'connect-src': ['*.commercetools.app'],
    },
  },
  // One locator for the stub; change S restores the full list.
  locators: ['products.product_details.general'],
};

export default config;
