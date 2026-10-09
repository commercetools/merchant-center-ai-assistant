/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { AppConfig, readConfiguration } from './config';
import { createApp } from './app';
import { logger } from './utils/logger.utils';

let config: AppConfig;
try {
  config = readConfiguration();
} catch (error) {
  logger.error((error as Error).message);
  process.exit(1);
}

if (config.auth.adminUserIds.size === 0) {
  logger.warn('ADMIN_USER_IDS is empty: no administrator');
}
if (config.auth.authDisabled) {
  logger.warn(
    'MC_AUTH_DISABLED=true: Merchant Center session verification is OFF (local development only)'
  );
}
logger.info('auth configuration', {
  audience: config.auth.mcAudience ?? 'not configured',
  issuerCloudIdentifier: config.auth.issuerCloudIdentifier,
  adminCount: config.auth.adminUserIds.size,
});
for (const warning of config.providers.warnings) {
  logger.warn(warning);
}

for (const warning of config.gcp.warnings) {
  logger.warn(warning);
}

const server = createApp(config).listen(config.server.port, () => {
  logger.info(`service listening on ${config.server.port}`);
});

// Connect stops instances with SIGTERM.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
