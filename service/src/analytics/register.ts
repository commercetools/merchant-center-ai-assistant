/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../config';
import { registerSessionCleanupHook } from '../services/session.service';
import { imageCleanupHook } from '../storage/cleanup-hook';
import { createGcsImageUploader } from '../storage/uploader';
import { setImageUploader } from '../tool-sources/image-uploader';
import { bigqueryCleanupHook } from './cleanup/bigquery-hook';

/*
 * Change L wiring. Nothing here touches Google: clients are lazy (change F) and both hooks
 * check at run time whether a service-account key exists.
 *
 * The two cleanup hooks register at module initialisation (once per process, as change G
 * requires). The `bigquery` ToolSource is registered in `tool-sources/index.ts`; the files
 * route is mounted in `routes/service.route.ts`.
 */
registerSessionCleanupHook(bigqueryCleanupHook);
registerSessionCleanupHook(imageCleanupHook);

/**
 * Enables image generation (H's `imageGeneration` source) whenever Google Cloud is configured:
 * the bucket name always resolves, so only a missing service-account key disables it.
 */
export function installGcpImageUploader(config: AppConfig): void {
  setImageUploader(
    config.gcp.serviceAccount !== undefined ? createGcsImageUploader() : undefined
  );
}
