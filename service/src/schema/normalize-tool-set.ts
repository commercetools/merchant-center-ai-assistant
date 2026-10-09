/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { asSchema, jsonSchema } from '@ai-sdk/provider-utils';
import type { ToolSet } from 'ai';
import type { Log } from '../utils/log.types';
import { logger } from '../utils/logger.utils';
import {
  hasUnresolvableRef,
  hoistRefsForGemini,
  needsGeminiNormalization,
  normalizeJsonSchemaForGemini,
} from './json-schema';

type SchemaLike = Parameters<typeof asSchema>[0];

/**
 * Makes every tool of a merged tool set safe to send to Gemini (design D-H7).
 *
 * Schema conversion runs over the WHOLE tool set of a request, so one unusable tool from any
 * source strips the model of all of them. Hoisting is tried first because it preserves the
 * schema (recursion survives, size does not move); the lossy flattening normaliser runs only
 * when a reference cannot be hoisted.
 *
 * - Idempotent: a normalised schema no longer `needsGeminiNormalization`.
 * - Tools that need nothing are returned by identity.
 * - Never throws: a tool whose schema cannot be processed is kept as is and named in a warning.
 * - The tool's own validator is kept, so input validation does not change.
 */
export const normalizeToolSet = (
  tools: ToolSet,
  log: Pick<Log, 'warn' | 'info'> = logger
): ToolSet => {
  const hoisted: string[] = [];
  const flattened: string[] = [];

  const normalized = Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      try {
        const original = asSchema(tool.inputSchema as SchemaLike);
        const raw = original.jsonSchema;
        if (!raw || !needsGeminiNormalization(raw)) return [name, tool];

        const candidate = hoistRefsForGemini(raw);
        const usable = !hasUnresolvableRef(candidate);
        (usable ? hoisted : flattened).push(name);

        return [
          name,
          {
            ...tool,
            inputSchema: jsonSchema(
              usable ? candidate : normalizeJsonSchemaForGemini(raw),
              { validate: original.validate }
            ),
          },
        ];
      } catch (error) {
        log.warn(`schema normalisation skipped for tool ${name}`, {
          reason: error instanceof Error ? error.message : String(error),
        });
        return [name, tool];
      }
    })
  ) as ToolSet;

  if (hoisted.length) {
    log.info(`hoisted refs into $defs for ${hoisted.join(', ')}`);
  }
  if (flattened.length) {
    log.info(
      `flattened Gemini-incompatible schemas in ${flattened.join(', ')} - these are limited to toolChoice 'auto'`
    );
  }
  return normalized;
};
