/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { getBigqueryPrompt } from '../../agents/prompts';
import type { ToolSource } from '../../tool-sources/types';
import { createQueryToolFor, QUERY_AGGREGATED_DATA_TOOL } from './query';
import { makeSessionTables } from './session-tables';
import { createTableInfoToolFor, GET_TABLE_INFO_TOOL } from './table';

/**
 * Replaces the legacy `bigquery.agent.ts` (its `createAgent` was dead code: the flat
 * orchestrator merges tools). The tools are created PER REQUEST with the session bound.
 * No other source may provide `query_aggregated_data` (the registry would log a collision).
 */
export const bigquerySource: ToolSource = {
  name: 'bigquery',
  displayName: 'BigQuery analytics',
  description:
    'SQL analytics over tool results stored in this conversation (tables named in the conversation).',
  kind: 'core',
  routingHints:
    'Keywords: SQL, query, aggregate, sum, count, average, group by, join, analyze data, BigQuery.',
  order: 70,
  isEnabled: async (ctx) =>
    ctx.config.gcp.serviceAccount !== undefined &&
    Boolean(ctx.config.gcp.bigquery.datasetId),
  getTools: async (ctx) => {
    const tables = makeSessionTables(ctx.sessionId, ctx.user.userId);
    return {
      [GET_TABLE_INFO_TOOL]: createTableInfoToolFor(tables),
      [QUERY_AGGREGATED_DATA_TOOL]: createQueryToolFor(ctx.sessionId, tables),
    };
  },
  // No menu group for it (legacy parity).
  listForMenu: async () => null,
  getPrompt: (ctx) => getBigqueryPrompt(ctx),
};
