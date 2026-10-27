/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../utils/logger.utils';
import type { AuthenticatedRequest } from '../types/request.types';

export type BootstrapContributor = (
  req: AuthenticatedRequest
) => Promise<Record<string, unknown>>;

const RESERVED_KEYS = new Set(['projectKey', 'userId', 'isAdmin']);
const contributors = new Map<string, BootstrapContributor>();

/** Other modules (for example the identity MCP routes) add fields to the bootstrap payload. */
export function registerBootstrapContributor(
  name: string,
  fn: BootstrapContributor
): void {
  if (contributors.has(name)) {
    throw new Error(`bootstrap contributor already registered: ${name}`);
  }
  contributors.set(name, fn);
}

/**
 * Runs all contributors concurrently. A failing contributor is logged and
 * omitted (a failed bootstrap would look like a dead session to the app).
 * A key used twice, or a reserved core key, is a programming error and throws.
 */
export async function runContributors(
  req: AuthenticatedRequest
): Promise<Record<string, unknown>> {
  const settled = await Promise.allSettled(
    [...contributors].map(async ([name, fn]) => [name, await fn(req)] as const)
  );
  const out: Record<string, unknown> = {};
  for (const result of settled) {
    if (result.status === 'rejected') {
      logger.warn('bootstrap contributor failed', {
        error: String(result.reason),
      });
      continue;
    }
    for (const [key, value] of Object.entries(result.value[1])) {
      if (key in out || RESERVED_KEYS.has(key)) {
        throw new Error(`bootstrap key collision: ${key}`);
      }
      out[key] = value;
    }
  }
  return out;
}

export const resetBootstrapContributorsForTests = (): void => contributors.clear();
