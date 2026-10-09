/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { asSchema } from '@ai-sdk/provider-utils';
import { logger } from './logger.utils';

type ToolLike = { inputSchema?: unknown; parameters?: unknown };

/**
 * Report tools whose input schema cannot be serialized to JSON Schema.
 *
 * The AI SDK builds each tool's JSON Schema lazily, when the request to the provider is
 * assembled, so a tool whose schema cannot be represented fails the whole turn with one
 * opaque error and no indication of which tool caused it (zod v4 refuses, for example, a
 * cyclic schema whose recursion runs through a required field). Tool sets are assembled from
 * several sources, so attributing the error matters.
 *
 * Called from a stream's `onError`, so it costs nothing unless a turn already failed.
 * Returns the names of the broken tools.
 */
export const logUnserializableToolSchemas = (
  tools: Record<string, unknown>,
  context: string
): string[] => {
  const broken: string[] = [];
  for (const [name, tool] of Object.entries(tools ?? {})) {
    const candidate = tool as ToolLike | null;
    try {
      // A getter may throw too, so the read is inside the try.
      const schema = candidate?.inputSchema ?? candidate?.parameters;
      if (!schema) continue;
      // `asSchema(...).jsonSchema` is exactly what the request builder does.
      void asSchema(schema as Parameters<typeof asSchema>[0]).jsonSchema;
    } catch (error) {
      broken.push(name);
      logger.error(`[tool-schema] ${context}: "${name}" has an unserializable inputSchema`, {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(
    `[tool-schema] ${context}: ${Object.keys(tools ?? {}).length} tools checked, ${
      broken.length
    } unserializable${broken.length ? `: ${broken.join(', ')}` : ''}`
  );
  return broken;
};
