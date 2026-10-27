/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { readConfiguration } from '../config';
import { onShutdown } from '../lifecycle';
import type { Log } from '../utils/log.types';
import { logger } from '../utils/logger.utils';
import {
  DisabledNimbusBackend,
  UnavailableNimbusBackend,
  type NimbusBackend,
} from './backend';
import { NimbusProcessManager } from './process-manager';
import { isResolveError, resolveNimbusMcp } from './resolve';
import { createNimbusToolSource } from './tool-source';

/** Chooses the backend: disabled, unavailable (package missing) or the embedded child. */
export const createNimbusBackend = (
  enabled: boolean,
  log: Log
): NimbusBackend => {
  if (!enabled) return new DisabledNimbusBackend();
  const resolved = resolveNimbusMcp();
  if (isResolveError(resolved)) {
    return new UnavailableNimbusBackend(resolved.error, log);
  }
  const manager = new NimbusProcessManager({ ...resolved, log });
  onShutdown(() => manager.close());
  return manager;
};

let backend: NimbusBackend | undefined;

/** Process-wide backend, created on first use (nothing is spawned until a tool is needed). */
export const getNimbusBackend = (): NimbusBackend => {
  backend ??= createNimbusBackend(readConfiguration().nimbus.enabled, logger);
  return backend;
};

/** The registered `nimbus` source (one line in `tool-sources/index.ts`). */
export const nimbusSource = createNimbusToolSource({
  backend: getNimbusBackend,
  enabled: (ctx) => ctx.config.nimbus.enabled,
  log: logger,
});

/** Test hook: replace (or with no argument drop) the cached backend. */
export const setNimbusBackendForTests = (next?: NimbusBackend): void => {
  backend = next;
};
