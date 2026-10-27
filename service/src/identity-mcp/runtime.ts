/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { AppConfig } from '../config';
import { readConfiguration } from '../config';
import { getPersistence } from '../persistence';
import { createIdentityStores } from './adapters/persistence';
import type { IdentityStores } from './ports';

/** What the HTTP handlers need: configuration plus the three ports. */
export interface IdentityRuntime {
  config: AppConfig;
  stores: IdentityStores;
  /** Test seam: replaces the global `fetch` for every outbound call of the HTTP handlers. */
  fetchFn?: typeof fetch;
}

let override: IdentityRuntime | undefined;

/** Production wiring (process-wide configuration and persistence); tests may replace it. */
export function getIdentityRuntime(): IdentityRuntime {
  return (
    override ?? {
      config: readConfiguration(),
      stores: createIdentityStores(getPersistence()),
    }
  );
}

export function setIdentityRuntimeForTests(
  runtime: IdentityRuntime | undefined
): void {
  override = runtime;
}

/** The fetch override of the test runtime, if any (the tool source has no runtime of its own). */
export const getFetchOverride = (): typeof fetch | undefined =>
  override?.fetchFn;
