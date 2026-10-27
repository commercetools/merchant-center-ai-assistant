/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { logger } from '../../utils/logger.utils';

/*
 * WIRE CONTRACT between the tool sources and `parseRawDataToTables` (pinned by
 * tests/analytics/payload.spec.ts).
 *
 * The parser reads a string `{"READ PRODUCT RESULT": {results, total, count}}` (pagination
 * nested under one title key).
 * A Managed MCP server returns a `CallToolResult` OBJECT whose text part holds
 * `{limit, offset, count, total, results}` at the TOP level. Handing the object to the parser
 * dies with `rawData.match is not a function`; unwrapping to the bare text loses total/count
 * and names the table `results`. So an MCP result is re-wrapped into the envelope the parser
 * already understands.
 */

const offloadEnvelopeTitle = (toolName: string): string =>
  `${toolName.replace(/[_-]+/g, ' ').trim().toUpperCase()} RESULT`;

interface McpLikeResult {
  structuredContent?: unknown;
  content?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The payload inside an MCP `CallToolResult`, or `undefined` if this is not one. Prefers
 * `structuredContent`; text parts are concatenated because a result may be split across
 * several; non-JSON text is returned as text.
 */
const mcpPayload = (result: unknown): unknown => {
  const mcp = result as McpLikeResult;
  if (mcp?.structuredContent !== undefined) return mcp.structuredContent;
  if (!Array.isArray(mcp?.content)) return undefined;

  const text = mcp.content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        isRecord(part) && part.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('');
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/** Converts a tool result into the one payload shape the offload understands. */
export const toOffloadPayload = (result: unknown, toolName: string): unknown => {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return result;

  const payload = mcpPayload(result) ?? result;
  if (typeof payload === 'string') return payload;

  try {
    return JSON.stringify({ [offloadEnvelopeTitle(toolName)]: payload });
  } catch {
    // Unserializable: leave it alone rather than invent a shape. Never log the value.
    logger.warn(`Could not serialize ${toolName} result for offload`);
    return result;
  }
};

export interface McpTextResult {
  content: { type: 'text'; text: string }[];
  isError: false;
}

/**
 * The offload message in the shape of the tool it stands in for. An MCP tool carries a
 * `toModelOutput` that starts with `'content' in result`, which throws on a string, so an MCP
 * result is answered with a `CallToolResult`; any other result with the plain string.
 */
export const toResultShapeOf = (
  message: string,
  original: unknown
): string | McpTextResult => {
  const isMcpResult =
    isRecord(original) && Array.isArray((original as McpLikeResult).content);
  return isMcpResult
    ? { content: [{ type: 'text', text: message }], isError: false }
    : message;
};
