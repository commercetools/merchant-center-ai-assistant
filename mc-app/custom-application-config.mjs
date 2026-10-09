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
      initialProjectKey: '${env:INITIAL_PROJECT_KEY}',
    },
  },
  additionalEnv: {
    chatServiceEndpointUrl: '${env:CHAT_SERVICE_ENDPOINT_URL}',
  },
  headers: {
    csp: {
      // The browser never contacts the service directly: every call goes through the
      // Merchant Center API's /proxy/forward-to, whose origin app-kit already allows.
      'connect-src': ['*.commercetools.app'],
    },
  },
  // Default View/Manage permission pair only (no custom permission, no additionalOAuthScopes).
  // The MCP scopes are the signed-in user's own Merchant Center scopes.
  oAuthScopes: {
    view: ['view_key_value_documents', 'view_mcp_servers'],
    manage: ['manage_key_value_documents', 'manage_mcp_servers'],
  },
  icon: '${path:@tabler/icons/outline/robot.svg}',
  mainMenuLink: {
    defaultLabel: 'AI Assistant',
    labelAllLocales: [],
    permissions: [PERMISSIONS.View],
  },
};

export default config;
