/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { RequestUser } from '../types/request.types';

/**
 * One group of the per-session tools menu. Entries are tool names, or objects when the
 * source also knows a description (descriptions are dropped before they reach the client).
 */
export type MenuGroup = {
  mcp: string;
  toolNames: Array<string | { toolName: string; description?: string }>;
};

/**
 * Seam for change H: its ToolSource registry implements this and installs itself with
 * `setToolMenuProvider` when the app is composed. G ships an empty default so it can be
 * tested alone.
 */
export interface ToolMenuProvider {
  listMenuGroups(ctx: {
    user: RequestUser;
    sessionId: string;
    locale?: string;
  }): Promise<MenuGroup[]>;
}

let provider: ToolMenuProvider = { listMenuGroups: async () => [] };

export const setToolMenuProvider = (p: ToolMenuProvider): void => {
  provider = p;
};

export const getToolMenuProvider = (): ToolMenuProvider => provider;
