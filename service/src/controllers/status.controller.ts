/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestHandler } from 'express';
import { readConfiguration } from '../config';

let version: string | undefined;

/**
 * Connect starts the service from the application folder, so package.json is in
 * the working directory (no __dirname: Jest runs this code as ESM).
 */
function packageVersion(): string {
  if (version === undefined) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8')
      ) as { version?: string };
      version = pkg.version ?? 'unknown';
    } catch {
      version = 'unknown';
    }
  }
  return version;
}

/** Liveness only: no network, no persistence, no secrets. */
export const status: RequestHandler = (_req, res) => {
  const config = readConfiguration();
  res.status(200).json({
    status: 'UP',
    service: 'ai-assistant',
    version: packageVersion(),
    persistence: config.persistence.driver,
    authConfigured:
      Boolean(config.auth.mcAudience) || config.auth.authDisabled,
    adminConfigured: config.auth.adminUserIds.size > 0,
  });
};
