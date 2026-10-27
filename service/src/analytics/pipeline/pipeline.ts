/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ModelMessage, ToolExecutionOptions, ToolSet } from 'ai';
import { analyzeQueryTask } from '../../agents/analyzer.agent';
import { GcpNotConfiguredError } from '../../gcp/credentials';
import { logger } from '../../utils/logger.utils';
import { sizeOf } from '../../utils/token-estimate.utils';
import { toOffloadPayload, toResultShapeOf } from './payload';
import {
  storeToolResultInBigQuery,
  type StoreInput,
  type StoreResult,
} from './store';

/** Who the offloaded table belongs to. */
export interface PipelineContext {
  sessionId: string;
  userId: string;
}

export interface PipelineDeps {
  analyze(input: {
    messages: ModelMessage[];
    toolCallParams: {
      args: unknown;
      toolName: string;
      result: unknown;
      resultChars: number;
    };
  }): Promise<{ output?: { hasAggregation?: boolean } }>;
  store(input: StoreInput): Promise<StoreResult | undefined>;
}

const defaultDeps: PipelineDeps = {
  analyze: (input) => analyzeQueryTask(input),
  store: (input) => storeToolResultInBigQuery(input),
};

const fmt = (n: number): string => n.toLocaleString('en-US');

/** The sentence(s) the model receives instead of the rows. */
export function offloadMessage(r: StoreResult): string {
  const action = r.isNewTable ? 'created' : 'appended data to';
  const pagination = r.total
    ? `Number of rows inserted is ${r.count} and the total number of available data is ${r.total}.`
    : '';
  // The columns are stated here so the model does not spend a step on get_table_info or
  // guess names (`Unrecognized name: orderNumber`, seen in three production turns).
  const columns = r.columns ? `Columns: ${r.columns}.` : '';
  const dropped =
    r.droppedRows > 0
      ? `${fmt(r.droppedRows)} rows were not stored because the result exceeded the per-result limit; say so if the user needs complete data.`
      : '';
  return [
    `BigQuery table ${action}: ${r.tableRef}. Use this table reference to fetch the data from the table and execute sql queries on it.`,
    columns,
    pagination,
    dropped,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

let warnedUnconfigured = false;
export const resetPipelineWarningsForTests = (): void => {
  warnedUnconfigured = false;
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? {}) ?? '';
  } catch {
    return '';
  }
};

type Execute = (input: unknown, options: ToolExecutionOptions<unknown>) => unknown;

const isAsyncIterable = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in (value as object);

function logOffloadFailure(error: unknown, name: string, chars: number): void {
  if (error instanceof GcpNotConfiguredError) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      logger.warn('Offload skipped: Google Cloud is not configured');
    }
    return;
  }
  // Log the failure class and size, never the rows.
  logger.error(
    `Offload failed for ${name} - returning ${chars} chars of raw result into context`,
    { reason: error instanceof Error ? error.message : 'unknown' }
  );
}

function wrapExecute(
  name: string,
  original: Execute,
  ctx: PipelineContext,
  deps: PipelineDeps
): Execute {
  return async (input, options) => {
    const result = await Promise.resolve(original(input, options));
    // Streaming (async-iterable) results cannot be measured without consuming them.
    if (result === undefined || isAsyncIterable(result)) return result;

    const chars = sizeOf(result);
    try {
      const verdict = await deps.analyze({
        messages: options?.messages ?? [],
        toolCallParams: { args: input, toolName: name, result, resultChars: chars },
      });
      if (!verdict?.output?.hasAggregation) return result;

      const stored = await deps.store({
        result: toOffloadPayload(result, name),
        toolName: name,
        toolArgs: safeStringify(input),
        sessionId: ctx.sessionId,
        userId: ctx.userId,
      });
      if (stored) return toResultShapeOf(offloadMessage(stored), result);
    } catch (error) {
      logOffloadFailure(error, name, chars);
    }
    return result;
  };
}

/**
 * Wraps every tool's `execute` with the analyzer + BigQuery offload. The wrapper never
 * throws because of the offload: any failure is logged (with the raw size, never row data)
 * and the tool's own result is returned.
 */
export function withToolResultPipeline(
  tools: ToolSet,
  ctx: PipelineContext,
  deps: PipelineDeps = defaultDeps
): ToolSet {
  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const original = tool.execute as unknown as Execute | undefined;
    if (!original) {
      wrapped[name] = tool;
      continue;
    }
    const execute = wrapExecute(name, original, ctx, deps);
    wrapped[name] = { ...tool, execute: execute as unknown as typeof tool.execute };
  }
  return wrapped;
}
