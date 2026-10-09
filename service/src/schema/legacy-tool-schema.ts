/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

import type { ToolSet } from 'ai';
import { asSchema, jsonSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod';

/**
 * Zod v4 keeps its definition on `_zod.def`. That is internal API, so everything below
 * reads it through these deliberately loose shapes instead of `any`.
 */
type ZodDef = Record<string, unknown> & { type?: string };
type ZodNodeLike = {
  _zod?: { def?: ZodDef };
  description?: string;
};
type SchemaLike = Parameters<typeof asSchema>[0];
type JsonNode = Record<string, unknown>;
type LegacyTool = Record<string, unknown> & {
  inputSchema?: unknown;
  parameters?: unknown;
};

const defOf = (node: unknown): ZodDef | undefined =>
  (node as ZodNodeLike | null | undefined)?._zod?.def;

const typeOf = (node: unknown): string | undefined => defOf(node)?.type;

/**
 * @stripe/agent-toolkit targets ai@4 and zod@3 (see its peerDependencies) - as did the
 * retired @commercetools/commerce-agent this shim was first written for - but this service
 * runs a much newer ai and forces zod@4 through the `resolutions` field. Three things break
 * as a result, and all of them have to be patched on the tools the toolkit hands back.
 *
 * 1. ai@4 read tool argument schemas from `parameters`; ai@6+ reads `inputSchema` and ignores
 *    `parameters` entirely. Left alone, every tool reaches the model with no argument schema,
 *    so the model invents arguments from the prose description and the handler rejects them
 *    during validation. Handled where the tools are re-wrapped below.
 *
 * 2. The schemas are authored as `z.record(z.any())`. zod@3 reads that as "string keys, any
 *    values"; zod@4 reads the single argument as the *key* type and leaves `valueType`
 *    undefined, so parsing any non-empty object throws
 *    `Cannot read properties of undefined (reading '_zod')`.
 *
 * 3. `z.tuple([...])` (the GeoJSON `coordinates` pair) serialises to draft-07 as
 *    `items: [schemaA, schemaB]`. Gemini's function-declaration schema treats `items` as a
 *    single schema rather than a list and @ai-sdk/google forwards the array form unchanged,
 *    so the whole request is rejected with `Proto field is not repeating, cannot start list`.
 *    Rewriting the tuple as a length-bounded array keeps the same validation semantics -
 *    arity and element type are still enforced - while serialising to a shape every provider
 *    accepts.
 *
 * Returns the schema to use, which may be a replacement rather than the original, so callers
 * must use the return value. Nodes are cached so shared and cyclic schemas are rewritten once.
 */
export const normalizeToolSchema = <T>(
  schema: T,
  cache = new Map<unknown, unknown>()
): T => {
  const def = defOf(schema);
  if (!def) return schema;
  if (cache.has(schema)) return cache.get(schema) as T;
  cache.set(schema, schema);

  if (def.type === 'record') {
    if (def.valueType === undefined) {
      def.keyType = z.string();
      def.valueType = z.any();
    } else if (typeOf(def.keyType) === 'any') {
      def.keyType = z.string();
    }
  }

  if (def.type === 'tuple' && Array.isArray(def.items)) {
    const entries = def.items.map((entry: unknown) =>
      normalizeToolSchema(entry, cache)
    );
    const rest = def.rest ? normalizeToolSchema(def.rest, cache) : undefined;
    const candidates = rest ? [...entries, rest] : entries;
    const uniform = candidates.every(
      (entry) => typeOf(entry) === typeOf(candidates[0])
    );
    const element: z.ZodType =
      candidates.length === 0
        ? z.any()
        : uniform
          ? (candidates[0] as z.ZodType)
          : z.union(candidates as unknown as [z.ZodType, z.ZodType]);

    let rewritten = z.array(element).min(entries.length);
    if (!rest) rewritten = rewritten.max(entries.length);
    const description = (schema as ZodNodeLike).description;
    if (description) rewritten = rewritten.describe(description);

    cache.set(schema, rewritten);
    return rewritten as unknown as T;
  }

  for (const key of [
    'valueType',
    'keyType',
    'element',
    'innerType',
    'left',
    'right',
    'in',
    'out',
  ]) {
    if (def[key]) def[key] = normalizeToolSchema(def[key], cache);
  }
  const shape = def.shape as Record<string, unknown> | undefined;
  if (shape) {
    for (const key of Object.keys(shape)) {
      shape[key] = normalizeToolSchema(shape[key], cache);
    }
  }
  for (const key of ['options', 'items']) {
    const entries = def[key];
    if (Array.isArray(entries)) {
      def[key] = entries.map((entry: unknown) =>
        normalizeToolSchema(entry, cache)
      );
    }
  }
  if (typeof def.getter === 'function') {
    try {
      normalizeToolSchema((def.getter as () => unknown)(), cache);
    } catch {
      // lazy schema that cannot be resolved standalone; nothing to normalize
    }
  }

  return schema;
};

/**
 * Remove `required` entries whose schema is a bare `$ref`, i.e. break required ref cycles.
 *
 * Gemini accepts a self-referential schema only when the cycle passes through an optional or
 * nullable property, or a possibly-empty array. A cycle made of REQUIRED fields is rejected:
 *
 *   "ref loops are only supported if they include optional or nullable property values, or a
 *    potentially-zero-length array items, but a ref loop of required fields was found at
 *    definitions.__schema0.anyOf.10.properties.elementType"
 *
 * Because every tool is sent in one request, one such tool takes down the whole turn.
 * Fixing this in the zod layer does not work: the cycle lives inside a `z.lazy`, whose getter
 * returns a fresh clone on every evaluation, so mutating one evaluation's nodes is discarded.
 * Hence the rewrite happens on the serialized JSON Schema.
 *
 * Dropping the property from `required` is safe: the tool handler and the commercetools API
 * still reject the input when the field is missing. Because `provider-utils` serializes with
 * `reused: 'inline'`, a `$ref` only survives for genuine cycles - non-recursive shared
 * schemas are inlined - so this cannot loosen an unrelated field.
 */
const breakRequiredRefCycles = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(breakRequiredRefCycles);
  if (!node || typeof node !== 'object') return node;

  const object = node as JsonNode;
  const properties = object.properties as Record<string, JsonNode> | undefined;
  if (Array.isArray(object.required) && properties) {
    object.required = (object.required as string[]).filter(
      (key) => properties[key]?.$ref === undefined
    );
    if ((object.required as string[]).length === 0) delete object.required;
  }

  for (const key of Object.keys(object)) {
    object[key] = breakRequiredRefCycles(object[key]);
  }
  return object;
};

/**
 * Make a tool schema safe to send to a provider that forwards `$ref`s.
 *
 * Returns the schema untouched unless it actually serialises with a `$ref` - so ordinary
 * (non-recursive) tools keep their original zod schema, and only recursive ones are converted
 * to a JSON-Schema-backed equivalent. Validation still runs against the original schema.
 */
export const sanitizeToolSchemaForProvider = <T>(schema: T): T => {
  if (!schema) return schema;

  let resolved: ReturnType<typeof asSchema>;
  let serialized: unknown;
  try {
    resolved = asSchema(schema as SchemaLike);
    serialized = resolved.jsonSchema;
  } catch {
    // Unserializable for some other reason - leave it alone so the failure is reported
    // against the real cause rather than being masked here.
    return schema;
  }

  if (!JSON.stringify(serialized ?? {}).includes('"$ref"')) return schema;

  return jsonSchema(
    () =>
      breakRequiredRefCycles(
        structuredClone(resolved.jsonSchema)
      ) as ReturnType<typeof asSchema>['jsonSchema'],
    { validate: resolved.validate }
  ) as unknown as T;
};

/**
 * Resolve the argument schema for a single tool authored against the ai@4 spec
 * (`parameters` instead of `inputSchema`).
 */
export const resolveLegacyInputSchema = (tool: unknown): unknown =>
  sanitizeToolSchemaForProvider(
    normalizeToolSchema(
      (tool as LegacyTool | null | undefined)?.inputSchema ??
        (tool as LegacyTool | null | undefined)?.parameters
    )
  );

/**
 * Rewrite a whole toolset from the ai@4 `parameters` shape onto `inputSchema`, normalizing
 * each schema on the way through. `parameters` is dropped from the result so a
 * silently-ignored second copy of the schema cannot drift.
 */
export const adaptLegacyToolSet = (tools: Record<string, unknown>): ToolSet =>
  Object.entries(tools ?? {}).reduce((acc: ToolSet, [toolName, tool]) => {
    const inputSchema = resolveLegacyInputSchema(tool);
    const adapted: LegacyTool = { ...(tool as LegacyTool) };
    delete adapted.parameters;
    if (inputSchema) adapted.inputSchema = inputSchema;
    acc[toolName] = adapted as unknown as ToolSet[string];
    return acc;
  }, {} as ToolSet);
