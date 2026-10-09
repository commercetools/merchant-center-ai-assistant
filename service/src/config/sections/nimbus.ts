/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { bool } from '../parse';
import { SectionParser } from '../types';

export interface NimbusConfig {
  /** Kill switch: false means the Nimbus child process is never spawned. */
  enabled: boolean;
}

/** Embedded Nimbus MCP (change K). One optional standard configuration key. */
export const parseNimbus: SectionParser<NimbusConfig> = (env) => {
  const errors: string[] = [];
  const enabled = bool(env, 'NIMBUS_MCP_ENABLED', true, errors);
  return { value: { enabled }, errors };
};
