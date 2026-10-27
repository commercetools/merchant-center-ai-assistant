/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import { describe, expect, test } from '@jest/globals';
import {
  hasUnresolvableRef,
  hoistRefsForGemini,
  needsGeminiNormalization,
  normalizeJsonSchemaForGemini,
} from '../../src/schema/json-schema';

/**
 * `read_product_search` as commercetools' Managed MCP Server actually serves it, reduced to
 * the parts that break conversion. Both failure modes are present:
 *
 *  - `exact` points at `#/properties/query/properties/fullText`, a plain JSON Pointer rather
 *    than a root `$defs` child, which `@ai-sdk/google` rejects outright;
 *  - `and.items` points back at `#/properties/query`, a cycle, which it also rejects;
 *  - `values` is `{ type: 'array' }` with no `items`, which the Gemini API rejects with
 *    `...properties[values].items: missing field`.
 *
 * This is a WIRE CONTRACT with the Gemini provider, not a unit test of a helper. Google's
 * schema conversion runs over the whole tool set for a request, so one unconvertible tool
 * removes every tool the model had - the observable symptom was a Merchant Center chat that
 * answered every message with "Google schema conversion only supports references to direct
 * children of root-level $defs or definitions" while all 48 MCP tools were live and healthy.
 */
const READ_PRODUCT_SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'object',
      description: 'The search query.',
      properties: {
        fullText: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            value: {},
            values: { type: 'array' },
            boost: { type: 'number' },
          },
          required: ['field'],
          additionalProperties: true,
        },
        exact: { $ref: '#/properties/query/properties/fullText' },
        prefix: { $ref: '#/properties/query/properties/fullText' },
        and: { type: 'array', items: { $ref: '#/properties/query' } },
        or: { type: 'array', items: { $ref: '#/properties/query' } },
        not: { $ref: '#/properties/query' },
      },
      additionalProperties: false,
    },
    limit: { type: 'number' },
  },
  additionalProperties: false,
} as const;

/** Every `$ref` reachable in a schema, wherever it appears. */
const collectRefs = (node: unknown, found: string[] = []): string[] => {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRefs(item, found));
    return found;
  }
  if (typeof node !== 'object' || node === null) return found;

  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') found.push(value);
    else collectRefs(value, found);
  }
  return found;
};

describe('MCP tool schema normalisation for Gemini', () => {
  test('detects the reference forms Google cannot convert', () => {
    expect(needsGeminiNormalization(READ_PRODUCT_SEARCH_SCHEMA)).toBe(true);

    // A root `$defs` child that does not recurse is fine as-is.
    expect(
      needsGeminiNormalization({
        type: 'object',
        properties: { a: { $ref: '#/$defs/Thing' } },
        $defs: { Thing: { type: 'string' } },
      })
    ).toBe(false);

    // ...but a `$defs` child that refers back to itself is not.
    expect(
      needsGeminiNormalization({
        type: 'object',
        properties: { a: { $ref: '#/$defs/Node' } },
        $defs: {
          Node: {
            type: 'object',
            properties: { child: { $ref: '#/$defs/Node' } },
          },
        },
      })
    ).toBe(true);

    // A dangling pointer must be reported rather than silently kept.
    expect(
      needsGeminiNormalization({
        type: 'object',
        properties: { a: { $ref: '#/$defs/Missing' } },
      })
    ).toBe(true);
  });

  test('leaves no $ref behind and no dead definition blocks', () => {
    const flattened = normalizeJsonSchemaForGemini(READ_PRODUCT_SEARCH_SCHEMA);

    expect(collectRefs(flattened)).toEqual([]);
    expect(needsGeminiNormalization(flattened)).toBe(false);
    expect(JSON.stringify(flattened)).not.toContain('$defs');
  });

  test('inlines a pointer reference in place of the sibling it names', () => {
    const flattened = normalizeJsonSchemaForGemini(
      READ_PRODUCT_SEARCH_SCHEMA
    ) as any;
    const { fullText, exact } = flattened.properties.query.properties;

    // `exact` was `{ $ref: '#/properties/query/properties/fullText' }`; it must now carry
    // fullText's own shape, not an empty object the model cannot fill in.
    expect(exact).toEqual(fullText);
    expect(exact.properties.field).toEqual({ type: 'string' });
    expect(exact.required).toEqual(['field']);
  });

  test('gives an item-less array the untyped element schema Gemini requires', () => {
    expect(needsGeminiNormalization({ type: 'array' })).toBe(true);
    expect(
      needsGeminiNormalization({ type: 'array', items: { type: 'string' } })
    ).toBe(false);

    const flattened = normalizeJsonSchemaForGemini(
      READ_PRODUCT_SEARCH_SCHEMA
    ) as any;

    // `{}` rather than a concrete element type: the source said "array of anything", and
    // narrowing it would silently forbid values commercetools does accept.
    expect(
      flattened.properties.query.properties.fullText.properties.values
    ).toEqual({ type: 'array', items: {} });

    // Also applied to the copies produced by inlining, including inside the expanded cycle.
    expect(
      flattened.properties.query.properties.and.items.properties.exact
        .properties.values
    ).toEqual({ type: 'array', items: {} });

    expect(needsGeminiNormalization(flattened)).toBe(false);
  });

  test('keeps one level of a recursive query and cuts the cycle below it', () => {
    const flattened = normalizeJsonSchemaForGemini(
      READ_PRODUCT_SEARCH_SCHEMA
    ) as any;
    const query = flattened.properties.query;

    // The recursive properties survive with a fully described element type...
    expect(Object.keys(query.properties).sort()).toEqual(
      ['and', 'exact', 'fullText', 'not', 'or', 'prefix'].sort()
    );
    expect(query.properties.and.items.properties.fullText).toBeDefined();

    // ...and the second level drops only the self-referencing operators, so the schema
    // stays finite. An empty `{ type: 'object' }` placeholder would not do: the Gemini API
    // rejects OBJECT schemas that declare no properties.
    const nested = query.properties.and.items.properties;
    expect(nested.and).toBeUndefined();
    expect(nested.or).toBeUndefined();
    expect(nested.not).toBeUndefined();
    expect(nested.exact).toBeDefined();
  });

  test('drops a required entry whose property was cut', () => {
    // A dangling pointer cannot be inlined, so the property goes - and `required` has to
    // follow it, or the schema demands a field the model has no way to supply.
    const flattened = normalizeJsonSchemaForGemini({
      type: 'object',
      properties: {
        ghost: { $ref: '#/$defs/Missing' },
        name: { type: 'string' },
      },
      required: ['ghost', 'name'],
    }) as any;

    expect(flattened.properties.ghost).toBeUndefined();
    expect(flattened.required).toEqual(['name']);
  });

  test('expands a whole-document self reference once, then cuts', () => {
    // `{ $ref: '#' }` is the degenerate cycle. It follows the same policy as any other:
    // one expansion so the shape is still described, then the repeat is dropped.
    const flattened = normalizeJsonSchemaForGemini({
      type: 'object',
      properties: {
        self: { $ref: '#' },
        name: { type: 'string' },
      },
    }) as any;

    expect(flattened.properties.self.properties.name).toEqual({
      type: 'string',
    });
    expect(flattened.properties.self.properties.self).toBeUndefined();
    expect(collectRefs(flattened)).toEqual([]);
  });

  test('is a no-op for schemas without references', () => {
    const plain = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    };

    expect(needsGeminiNormalization(plain)).toBe(false);
    expect(normalizeJsonSchemaForGemini(plain)).toEqual(plain);
  });
});

/**
 * The preferred strategy, and the reason it works is entirely a property of the provider:
 * `@ai-sdk/google` forwards a schema verbatim as `parametersJsonSchema` when - and only when -
 * conversion trips on a RECURSIVE reference. A reference it merely dislikes throws a different
 * error that is rethrown and kills the turn.
 *
 * So these are wire-contract assertions, not stylistic ones. Every `$ref` must end up a direct
 * child of root `$defs` (or the provider refuses to look at it), the cycle must SURVIVE (or the
 * pass-through never triggers and the item-less arrays reach the restricted schema, which
 * rejects them), and the schema must not grow (the flattened form is ~5x larger and Gemini
 * rejects that under forced tool choice).
 *
 * All three were confirmed against live Gemini before this was written; these tests pin the
 * transform so a future edit cannot quietly break the shape the model accepted.
 */
describe('hoisting MCP tool schema refs into root $defs', () => {
  test('leaves every reference a direct child of root $defs', () => {
    const hoisted = hoistRefsForGemini(READ_PRODUCT_SEARCH_SCHEMA) as any;

    expect(collectRefs(hoisted).length).toBeGreaterThan(0);
    for (const ref of collectRefs(hoisted)) {
      expect(ref).toMatch(/^#\/\$defs\/[^/]+$/);
      expect(hoisted.$defs[ref.slice('#/$defs/'.length)]).toBeDefined();
    }
    expect(hasUnresolvableRef(hoisted)).toBe(false);
  });

  test('keeps the cycle, which is what triggers the raw pass-through', () => {
    const hoisted = hoistRefsForGemini(READ_PRODUCT_SEARCH_SCHEMA) as any;

    // `query.and[]` still points back at the query it lives in, rather than at a copy that
    // was expanded once and then truncated.
    const query = hoisted.$defs.query;
    expect(query.properties.and.items.$ref).toBe('#/$defs/query');
    expect(query.properties.not.$ref).toBe('#/$defs/query');
    expect(hoisted.properties.query.$ref).toBe('#/$defs/query');
  });

  test('preserves the sibling operators as references rather than copies', () => {
    const hoisted = hoistRefsForGemini(READ_PRODUCT_SEARCH_SCHEMA) as any;
    const query = hoisted.$defs.query;

    // Both pointed at `#/properties/query/properties/fullText`; both should now point at the
    // same hoisted definition, not carry a duplicate of it.
    expect(query.properties.exact.$ref).toBe('#/$defs/query_fullText');
    expect(query.properties.prefix.$ref).toBe(query.properties.exact.$ref);
    expect(hoisted.$defs.query_fullText.properties.field).toEqual({
      type: 'string',
    });
  });

  test('fills in item-less arrays, which the converted form rejects', () => {
    const hoisted = hoistRefsForGemini(READ_PRODUCT_SEARCH_SCHEMA) as any;

    expect(hoisted.$defs.query_fullText.properties.values).toEqual({
      type: 'array',
      items: {},
    });
  });

  test('does not inflate the schema the way flattening does', () => {
    const raw = JSON.stringify(READ_PRODUCT_SEARCH_SCHEMA).length;
    const hoisted = JSON.stringify(
      hoistRefsForGemini(READ_PRODUCT_SEARCH_SCHEMA)
    ).length;
    const flattened = JSON.stringify(
      normalizeJsonSchemaForGemini(READ_PRODUCT_SEARCH_SCHEMA)
    ).length;

    expect(hoisted).toBeLessThan(raw * 1.3);
    expect(flattened).toBeGreaterThan(raw * 2);
  });

  test('handles a whole-document self-reference', () => {
    const hoisted = hoistRefsForGemini({
      type: 'object',
      properties: {
        name: { type: 'string' },
        children: { type: 'array', items: { $ref: '#' } },
      },
    }) as any;

    expect(hoisted.$ref).toBe('#/$defs/root');
    expect(hoisted.$defs.root.properties.children.items.$ref).toBe(
      '#/$defs/root'
    );
    expect(hasUnresolvableRef(hoisted)).toBe(false);
  });

  test('reports a reference it cannot hoist, so the caller can fall back', () => {
    // Nothing to resolve, so there is no target to move into `$defs`. Left alone here, this
    // would reach the provider and throw the non-recursive error that takes down every tool
    // in the request - hence the flattening fallback in schema/normalize-tool-set.ts.
    const dangling = hoistRefsForGemini({
      type: 'object',
      properties: { broken: { $ref: '#/properties/missing' } },
    });

    expect(hasUnresolvableRef(dangling)).toBe(true);
    expect(collectRefs(normalizeJsonSchemaForGemini(dangling))).toEqual([]);
  });

  test('leaves an already-valid root $defs reference alone', () => {
    const schema = {
      type: 'object',
      $defs: { id: { type: 'string' } },
      properties: { a: { $ref: '#/$defs/id' }, b: { $ref: '#/$defs/id' } },
    };

    expect(hoistRefsForGemini(schema)).toEqual(schema);
  });

  /**
   * The GeoJSON `coordinates` pair from `update_channels`, verbatim. One node, in one tool of
   * 135, and it rejected every request the whole tool set appeared in:
   *
   *   Unknown name "items" at 'tools[0].function_declarations[26].parameters...': Proto field
   *   is not repeating, cannot start list.
   *
   * Both strategies have to handle it, because the provider forwards a tuple unchanged on the
   * converted path and the API is what refuses it.
   */
  const COORDINATES_TUPLE = {
    type: 'object',
    properties: {
      geoLocation: {
        type: 'object',
        properties: {
          coordinates: {
            type: 'array',
            items: [{ type: 'number' }, { type: 'number' }],
          },
        },
      },
    },
  } as const;

  test('collapses a uniform tuple to one element type with bounds', () => {
    const hoisted = hoistRefsForGemini(COORDINATES_TUPLE) as any;

    expect(hoisted.properties.geoLocation.properties.coordinates).toEqual({
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
    });
  });

  test('collapses a mixed tuple to a union of its positions', () => {
    const hoisted = hoistRefsForGemini({
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
    }) as any;

    expect(hoisted.items).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
    expect(hoisted.maxItems).toBe(2);
  });

  test('leaves the array open when the tuple has a rest schema', () => {
    const hoisted = hoistRefsForGemini({
      type: 'array',
      items: [{ type: 'string' }],
      additionalItems: { type: 'string' },
    }) as any;

    expect(hoisted.items).toEqual({ type: 'string' });
    expect(hoisted.minItems).toBe(1);
    expect(hoisted.maxItems).toBeUndefined();
    expect(hoisted.additionalItems).toBeUndefined();
  });

  test('collapses the 2020-12 prefixItems spelling too', () => {
    const hoisted = hoistRefsForGemini({
      type: 'array',
      prefixItems: [{ type: 'number' }, { type: 'number' }],
    }) as any;

    expect(hoisted.prefixItems).toBeUndefined();
    expect(hoisted.items).toEqual({ type: 'number' });
    expect(hoisted.maxItems).toBe(2);
  });

  test('the gate and the fallback both see a tuple', () => {
    expect(needsGeminiNormalization(COORDINATES_TUPLE)).toBe(true);

    const flattened = normalizeJsonSchemaForGemini(COORDINATES_TUPLE) as any;
    expect(
      flattened.properties.geoLocation.properties.coordinates.items
    ).toEqual({ type: 'number' });
  });

  test('is a no-op for schemas without references or bare arrays', () => {
    const plain = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        tags: { type: 'array', items: {} },
      },
      required: ['id'],
    };

    expect(hoistRefsForGemini(plain)).toEqual(plain);
    expect(hasUnresolvableRef(plain)).toBe(false);
  });
});
