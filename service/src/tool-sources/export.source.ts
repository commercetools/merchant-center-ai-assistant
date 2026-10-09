/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool } from 'ai';
import { getExportPrompt } from '../agents/prompts';
import { EXPORT_DATA_TOOL, exportDataTool } from '../tools/export.tool';
import type { ToolSource } from './types';

/** Always-on `export_data` (CSV, base64 content). */
export const exportSource: ToolSource = {
  name: 'export',
  displayName: 'Data export',
  description:
    'Exports data that was fetched first to a downloadable CSV file.',
  kind: 'core',
  order: 120,
  isEnabled: async () => true,
  getTools: async () => ({ [EXPORT_DATA_TOOL]: tool(exportDataTool) }),
  listForMenu: async () => null,
  getPrompt: (ctx) => getExportPrompt(ctx),
};
