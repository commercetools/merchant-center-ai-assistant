/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Log } from '../utils/log.types';

/**
 * One consistent, secret-free line for an expected failure of a third-party source:
 * provider, error class and duration. The error message is deliberately NOT logged (a
 * provider can echo parts of a request, including a key); URLs are never logged either.
 */
export const logSourceFailure = (
  log: Log,
  provider: string,
  error: unknown,
  startedAt: number
): void => {
  const cls = (error as Error | undefined)?.constructor?.name ?? 'Error';
  log.warn(
    `TOOLSOURCE_FAILED provider=${provider} class=${cls} ms=${Date.now() - startedAt}`
  );
};
