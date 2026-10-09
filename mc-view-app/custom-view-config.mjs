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
  // Default View/Manage pair only (no custom permission, no additionalOAuthScopes).
  // Managed MCP scopes: S drops them again if the panel does not list MCP servers.
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
      'img-src': ['*.gstatic.com', '*.gravatar.com', 'gravatar.com'],
      'font-src': ['*.gstatic.com'],
      'style-src': ['*.gstatic.com'],
    },
  },
  // S replaces this with the full 65-locator list.
  locators: ['categories'],
};

export default config;
