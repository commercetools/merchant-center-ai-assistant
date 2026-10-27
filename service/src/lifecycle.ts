/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from './utils/logger.utils';

type ShutdownHook = () => Promise<void> | void;

const hooks: ShutdownHook[] = [];

/** Registers work to do when the service stops (SIGTERM / SIGINT), e.g. stopping a child process. */
export const onShutdown = (hook: ShutdownHook): void => {
  hooks.push(hook);
};

/** Runs every hook; a failing hook is logged and never blocks the others. */
export const runShutdownHooks = async (): Promise<void> => {
  await Promise.all(
    hooks.splice(0).map(async (hook) => {
      try {
        await hook();
      } catch (error) {
        logger.warn('shutdown hook failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );
};
