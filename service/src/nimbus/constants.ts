/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/** The tools `@commercetools/nimbus-mcp` serves. Readiness and drift warnings compare to this. */
export const NIMBUS_EXPECTED_TOOLS = [
  'list_components',
  'get_component',
  'get_docs_page',
  'search_docs',
  'get_tokens',
  'search_icons',
  'migrate_from_uikit',
] as const;

/** How long one tool call may take before it counts as a timeout. */
export const CALL_TIMEOUT_MS = 20_000;
/** Consecutive call timeouts after which the child is assumed wedged and recycled. */
export const RECYCLE_AFTER_TIMEOUTS = 3;
/** `getTools` waits at most this long for the first handshake (cold start). */
export const FIRST_HANDSHAKE_DEADLINE_MS = 3_000;
/** Spawn plus MCP initialize must finish within this time. */
export const SPAWN_TIMEOUT_MS = 15_000;
/** The child is shut down after this long without a call (a later call respawns it). */
export const IDLE_SHUTDOWN_MS = 10 * 60_000;
/** A readiness verdict is reused for this long (failures: `READINESS_FAILURE_CACHE_MS`). */
export const READINESS_CACHE_MS = 30_000;
export const READINESS_FAILURE_CACHE_MS = 5_000;
/** The child's heap cap; its resident size at rest is about 71 MB. */
export const CHILD_NODE_OPTIONS = '--max-old-space-size=96';
/** Tool source name; also the key under which a session would store disabled tools. */
export const NIMBUS_MCP = 'nimbus';
