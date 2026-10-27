/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import { asSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod';
import {
  adaptLegacyToolSet,
  normalizeToolSchema,
  resolveLegacyInputSchema,
  sanitizeToolSchemaForProvider,
} from '../../src/schema/legacy-tool-schema';

describe('legacy (ai@4 `parameters`) tool adaptation', () => {
  test('moves `parameters` onto `inputSchema` and drops the stale copy', () => {
    const adapted = adaptLegacyToolSet({
      do_thing: {
        description: 'does a thing',
        parameters: z.object({ name: z.string() }),
        execute: async () => 'ok',
      },
    });

    expect(adapted.do_thing.inputSchema).toBeDefined();
    expect((adapted.do_thing as any).parameters).toBeUndefined();
    expect(adapted.do_thing.description).toBe('does a thing');
    expect(typeof adapted.do_thing.execute).toBe('function');
  });

  test('leaves a tool that already uses `inputSchema` alone', () => {
    const inputSchema = z.object({ id: z.string() });
    const adapted = adaptLegacyToolSet({
      modern: { description: 'd', inputSchema, execute: async () => 'ok' },
    });

    expect(adapted.modern.inputSchema).toBe(inputSchema);
  });
});

describe('zod v4 schema normalization', () => {
  test('repairs `z.record(z.any())`, which zod v4 parses as a key-only record', () => {
    // zod@3 read z.record(z.any()) as "string keys, any values"; zod@4 treats the single
    // argument as the KEY type and leaves valueType undefined, so parsing any non-empty
    // object throws "Cannot read properties of undefined (reading '_zod')".
    // zod@4's types reject the 1-arg form outright, but commerce-agent was authored against
    // zod@3 and calls it that way at runtime - so build it the way the library really does.
    const oneArgRecord = (z.record as any)(z.any());
    const schema = z.object({ attrs: oneArgRecord });
    const repaired = normalizeToolSchema(schema);

    expect(() =>
      (repaired as any).parse({ attrs: { anything: 1, nested: { a: 'b' } } })
    ).not.toThrow();
  });

  test('rewrites `z.tuple` as a length-bounded array, preserving arity', () => {
    // z.tuple serialises to draft-07 as `items: [a, b]`; Gemini treats `items` as a single
    // schema, so the request is rejected with "Proto field is not repeating".
    const rewritten = normalizeToolSchema(z.tuple([z.number(), z.number()]));

    expect(rewritten.parse([1, 2])).toEqual([1, 2]);
    expect(() => rewritten.parse([1])).toThrow();
    expect(() => rewritten.parse([1, 2, 3])).toThrow();
  });

  test('resolveLegacyInputSchema tolerates a tool with neither key', () => {
    expect(resolveLegacyInputSchema({ description: 'no schema' })).toBeUndefined();
    expect(resolveLegacyInputSchema(undefined)).toBeUndefined();
  });
});

describe('required $ref cycles (recursive tool schemas)', () => {
  // Mirrors @commercetools/tools-core's `attributeType`: a lazy union whose `set` member
  // recurses through a REQUIRED property. Gemini rejects that shape outright.
  const attributeType: any = z.lazy(() =>
    z.union([
      z.object({ name: z.literal('boolean') }),
      z.object({ name: z.literal('text') }),
      z.object({ name: z.literal('set'), elementType: attributeType }),
    ])
  );

  const recursiveTool = z.object({
    id: z.string(),
    attribute: attributeType,
  });

  test('a non-recursive schema is passed through untouched', () => {
    const plain = z.object({ q: z.string() });
    expect(sanitizeToolSchemaForProvider(plain)).toBe(plain);
  });

  test('a recursive schema serialises with no required $ref left', () => {
    const sanitized = sanitizeToolSchemaForProvider(recursiveTool);
    expect(sanitized).not.toBe(recursiveTool);

    const js = asSchema(sanitized).jsonSchema;
    const serialized = JSON.stringify(js);
    // The cycle itself must survive - we are breaking requiredness, not the recursion.
    expect(serialized).toContain('"$ref"');

    // Assert no object still lists a $ref-valued property as required.
    const offenders: string[] = [];
    const walk = (node: any, path: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.required) && node.properties) {
        for (const key of node.required) {
          if (node.properties[key]?.$ref !== undefined) offenders.push(`${path}.${key}`);
        }
      }
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    walk(js, '$');
    expect(offenders).toEqual([]);
  });

  test('validation still enforces the original schema', async () => {
    const sanitized = sanitizeToolSchemaForProvider(recursiveTool);
    const validate = asSchema(sanitized).validate!;

    const ok = await validate({
      id: 'a',
      attribute: { name: 'set', elementType: { name: 'text' } },
    });
    expect(ok.success).toBe(true);

    // `elementType` is only optional in the JSON Schema we advertise; the real schema
    // still rejects a `set` without it.
    const bad = await validate({ id: 'a', attribute: { name: 'set' } });
    expect(bad.success).toBe(false);
  });
});
