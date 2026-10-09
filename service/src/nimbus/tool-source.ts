/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import type { ToolContext, ToolSource } from '../tool-sources/types';
import type { Log } from '../utils/log.types';
import type { NimbusBackend } from './backend';
import { withBatchedComponentLookup } from './batch';
import { FIRST_HANDSHAKE_DEADLINE_MS, NIMBUS_MCP } from './constants';
import { diffToolNames } from './readiness';

/**
 * Resolves with the value, or with `null` after `ms`. The underlying promise is NOT
 * cancelled: it keeps running so the next call finds the work done.
 */
const withDeadline = async <T>(
  work: Promise<T>,
  ms: number,
  log: Log
): Promise<T | null> => {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      log.warn('NIMBUS_HANDSHAKE_DEADLINE', {
        message:
          'nimbus-mcp is not ready yet; this turn runs without Nimbus tools',
        ms,
      });
      resolve(null);
    }, ms);
    timer.unref();
  });
  // A late failure must not become an unhandled rejection.
  work.catch(() => undefined);
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export interface NimbusToolSourceOptions {
  /** Lazy so a disabled or never-used Nimbus creates nothing. */
  backend: () => NimbusBackend;
  /** The kill switch (`NIMBUS_MCP_ENABLED`). */
  enabled: (ctx: ToolContext) => boolean;
  log: Log;
  /** Test knob. */
  handshakeDeadlineMs?: number;
}

/**
 * The `nimbus` tool source: the design system's documentation tools, in every standard
 * chat turn, with `get_component` replaced by the batched `get_components`. No menu group, no
 * prompt fragment (the usage guidance lives in the page-generation prompt). The custom-view
 * orchestrator selects only `commercetools` + `commercetools-knowledge`, so it never gets
 * these tools. The registry already adds the 15 s timeout and failure isolation.
 */
export const createNimbusToolSource = (
  options: NimbusToolSourceOptions
): ToolSource => {
  const warnedDrift = new Set<string>();

  const warnOnDrift = (names: string[]): void => {
    const { missing, extra } = diffToolNames(names);
    const key = `${missing.join(',')}|${extra.join(',')}`;
    if ((missing.length > 0 || extra.length > 0) && !warnedDrift.has(key)) {
      warnedDrift.add(key);
      options.log.warn('nimbus-mcp tool set drift', { missing, extra });
    }
  };

  return {
    name: NIMBUS_MCP,
    displayName: 'Nimbus design system',
    description:
      'Documentation of the Nimbus design system (components, props, tokens, icons) for building pages',
    // Right after change M's page-generation source (order 60).
    order: 61,
    isEnabled: async (ctx) => options.enabled(ctx),
    getTools: async (): Promise<ToolSet> => {
      try {
        const served = await withDeadline(
          options.backend().tools(),
          options.handshakeDeadlineMs ?? FIRST_HANDSHAKE_DEADLINE_MS,
          options.log
        );
        if (!served) return {};
        warnOnDrift(Object.keys(served));
        return withBatchedComponentLookup(served);
      } catch (error) {
        options.log.warn('nimbus tools unavailable; continuing without them', {
          error: error instanceof Error ? error.message : String(error),
        });
        return {};
      }
    },
    listForMenu: async () => null,
    getPrompt: () => '',
  };
};
