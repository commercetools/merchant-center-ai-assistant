/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { DisabledTools, SessionTool } from '../types/chat.types';

/**
 * Per-session tool switches.
 *
 * The available tools of a group come from the tool sources; this module only answers
 * "which of these did the user switch off?". A tool absent from the stored disabled set is
 * ENABLED, so a tool added by a source is usable immediately and a removed one leaves no
 * stale row.
 */

/** The tool names switched off for one group. */
export const disabledNamesFor = (
  disabled: DisabledTools | undefined,
  group: string
): Set<string> => new Set(disabled?.[group] ?? []);

/** Narrow a group's available tools to the ones enabled for this session. */
export const filterEnabled = (
  available: string[],
  disabled: Set<string>
): string[] => available.filter((name) => !disabled.has(name));

/**
 * A group's tools with their on/off state, for the menu. Descriptions are accepted and
 * DROPPED: a Managed MCP `tools/list` made this response 169 KB and the UI only renders a
 * name and a switch.
 */
export const toSessionTools = (
  available: Array<string | { toolName: string; description?: string }>,
  disabled: Set<string>,
  unavailable: ReadonlySet<string> = new Set()
): SessionTool[] =>
  available.map((entry) => {
    const toolName = typeof entry === 'string' ? entry : entry.toolName;
    return {
      toolName,
      enabled: !disabled.has(toolName),
      ...(unavailable.has(toolName) ? { available: false as const } : {}),
    };
  });
