/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ObjectGateway } from '../gateway/types';
import type { Containers } from '../names';

/** What every store needs; built once by `createPersistence`. */
export interface StoreDeps {
  gw: ObjectGateway;
  c: Containers;
  /** Maximum requests in flight for bulk operations. */
  concurrency: number;
}
