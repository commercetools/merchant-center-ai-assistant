/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { Log } from '../utils/log.types';
import type { Readiness } from './backend';
import {
  NIMBUS_EXPECTED_TOOLS,
  READINESS_CACHE_MS,
  READINESS_FAILURE_CACHE_MS,
} from './constants';

/** Names in `served` that are not expected, and expected names that are not served. */
export const diffToolNames = (
  served: readonly string[]
): { missing: string[]; extra: string[] } => ({
  missing: NIMBUS_EXPECTED_TOOLS.filter((name) => !served.includes(name)),
  extra: served.filter(
    (name) => !(NIMBUS_EXPECTED_TOOLS as readonly string[]).includes(name)
  ),
});

export interface ReadinessOptions {
  /** Lists the names of the tools the child serves; may reject. */
  listToolNames: () => Promise<string[]>;
  version: string;
  log: Log;
  now?: () => number;
}

/**
 * The verdict "the child handshook and serves the 7 expected tools". Cached: 30 s for a
 * verdict, 5 s for a failure, so the unauthenticated route cannot be used to hammer the
 * child. Concurrent callers share one check. Never rejects.
 */
export const createReadiness = (
  options: ReadinessOptions
): (() => Promise<Readiness>) => {
  const now = options.now ?? Date.now;
  let cached: { value: Readiness; until: number } | undefined;
  let inFlight: Promise<Readiness> | undefined;

  const check = async (): Promise<Readiness> => {
    try {
      const names = [...(await options.listToolNames())].sort();
      const { missing, extra } = diffToolNames(names);
      if (extra.length > 0) {
        options.log.warn('nimbus-mcp serves unexpected tools', { extra });
      }
      const base = {
        nimbusMcp: options.version,
        tools: names.length,
        toolNames: names,
      };
      return missing.length > 0
        ? { status: 'degraded', ...base, missing }
        : { status: 'ok', ...base };
    } catch (error) {
      return {
        status: 'error',
        nimbusMcp: options.version,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return async () => {
    if (cached && cached.until > now()) return cached.value;
    inFlight ??= check()
      .then((value) => {
        const ttl =
          value.status === 'error'
            ? READINESS_FAILURE_CACHE_MS
            : READINESS_CACHE_MS;
        cached = { value, until: now() + ttl };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
};
