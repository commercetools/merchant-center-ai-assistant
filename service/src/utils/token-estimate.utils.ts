/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * Cheap size measurement, for the places that make a DECISION from it.
 *
 * These two functions are all that survives of the latency-measurement instrumentation that
 * used to live in `context-audit.utils.ts`. They are kept because they are load-bearing, not
 * diagnostic:
 *
 *  - `analyzer.agent.ts` gates the BigQuery offload on `estimateTokens(resultChars)`;
 *  - `tool-result-pipeline.ts` measures each tool result once with `sizeOf` and hands the
 *    count to the analyzer, so `JSON.stringify` runs once per tool call instead of twice.
 *
 * Neither logs anything.
 */

/**
 * Characters per token. Gemini does not publish an exact ratio and it varies with the
 * content - JSON tool results tokenize worse than prose - so this is an order-of-magnitude
 * figure. Both callers use it for a threshold with a wide margin, never as a quota check.
 * Measured against `usage.inputTokens` over ten turns it ran 0.93-1.00 accurate.
 */
const CHARS_PER_TOKEN = 4;

export const estimateTokens = (chars: number): number =>
  Math.ceil(chars / CHARS_PER_TOKEN);

/**
 * Serialized size of a value, in characters, without throwing.
 *
 * Tool results reach us holding things `JSON.stringify` refuses - BigQuery's `Numeric`
 * wrappers, circular references from MCP clients - and this must never be the thing that
 * fails a tool call, so anything unserializable falls back to `String(value)`. Note what
 * that means for a circular object: `'[object Object]'.length`, i.e. 15, not its real size.
 * The offload gate treats a too-small answer as "small enough to keep", which is the safe
 * direction to be wrong in.
 */
export const sizeOf = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    try {
      return String(value).length;
    } catch {
      return 0;
    }
  }
};
