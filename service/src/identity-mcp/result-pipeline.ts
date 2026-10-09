/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';

export interface PipelineContext {
  sessionId: string;
  userId: string;
}

/**
 * TEMPORARY FALLBACK. Change L owns the real `withToolResultPipeline` (large tool results are
 * offloaded to BigQuery). Until L is merged this passes the tools through unchanged. When L
 * lands, delete this file and import L's function in `tool-source.ts` (one import line).
 */
export const withToolResultPipeline = (
  tools: ToolSet,
  _ctx: PipelineContext
): ToolSet => tools;
