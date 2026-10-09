/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { asSchema, jsonSchema } from '@ai-sdk/provider-utils';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { needsGeminiNormalization } from '../../src/schema/json-schema';
import { normalizeToolSet } from '../../src/schema/normalize-tool-set';

type JsonObject = Record<string, unknown>;

const jsonTool = (schema: JsonObject, validate?: (value: unknown) => never) =>
  ({
    description: 'tool',
    inputSchema: jsonSchema(
      schema as never,
      validate ? { validate: validate as never } : undefined
    ),
    execute: async () => 'ok',
  }) as unknown as ToolSet[string];

const REF_HEAVY: JsonObject = {
  type: 'object',
  properties: {
    query: {
      type: 'object',
      properties: {
        fullText: { type: 'object', properties: { term: { type: 'string' } } },
      },
    },
    exact: { $ref: '#/properties/query/properties/fullText' },
    values: { type: 'array' },
  },
};

const log = () => ({ warn: jest.fn(), info: jest.fn() });

describe('normalizeToolSet', () => {
  it('rewrites a ref-heavy tool and is idempotent', () => {
    const tools: ToolSet = { read_product_search: jsonTool(REF_HEAVY) };
    const once = normalizeToolSet(tools, log());
    const schemaOnce = asSchema(
      once.read_product_search.inputSchema as never
    ).jsonSchema;
    expect(needsGeminiNormalization(schemaOnce)).toBe(false);
    expect(JSON.stringify(schemaOnce)).toContain('$defs');

    const twice = normalizeToolSet(once, log());
    expect(twice.read_product_search).toBe(once.read_product_search);
    expect(
      asSchema(twice.read_product_search.inputSchema as never).jsonSchema
    ).toEqual(schemaOnce);
  });

  it('returns a clean tool by identity', () => {
    const clean = tool({
      description: 'x',
      inputSchema: z.object({ a: z.string() }),
    });
    const out = normalizeToolSet({ clean }, log());
    expect(out.clean).toBe(clean);
  });

  it('keeps a throwing tool and names it in a warning, others unaffected', () => {
    const broken = {
      description: 'broken',
      get inputSchema(): never {
        throw new Error('ref loop');
      },
    } as unknown as ToolSet[string];
    const logger = log();
    const out = normalizeToolSet({ broken, good: jsonTool(REF_HEAVY) }, logger);
    expect(out.broken).toBe(broken);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('broken'),
      expect.anything()
    );
    expect(
      needsGeminiNormalization(
        asSchema(out.good.inputSchema as never).jsonSchema
      )
    ).toBe(false);
  });

  it('keeps the original validator', () => {
    const validate = jest.fn(() => {
      throw new Error('rejected');
    });
    const out = normalizeToolSet(
      { t: jsonTool(REF_HEAVY, validate as never) },
      log()
    );
    const schema = asSchema(out.t.inputSchema as never);
    expect(schema.validate).toBe(validate);
  });
});
