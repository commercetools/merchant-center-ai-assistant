/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { tool } from 'ai';
import { getVisualizePrompt } from '../agents/prompts';
import {
  VISUALIZE_DATA_TOOL,
  visualizeDataTool,
} from '../tools/visualize.tool';
import type { ToolSource } from './types';

/** Always-on `visualize_data` (Google Charts specification). */
export const visualizeSource: ToolSource = {
  name: 'visualize',
  displayName: 'Data visualization',
  description:
    'Creates standalone charts and graphs from data that was fetched first (bar, line, pie, table, ...).',
  kind: 'core',
  order: 110,
  isEnabled: async () => true,
  getTools: async () => ({ [VISUALIZE_DATA_TOOL]: tool(visualizeDataTool) }),
  listForMenu: async () => null,
  getPrompt: (ctx) => getVisualizePrompt(ctx),
};
