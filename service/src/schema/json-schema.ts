/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 commercetools GmbH and the commercetools-labs contributors
 * Freely available, AS IS and UNSUPPORTED. See LICENSE.
 */

/**
 * JSON Schema normalisation for MCP tool inputs.
 *
 * MCP servers hand us whatever JSON Schema their SDK generated. Gemini's function-calling
 * schema is a much smaller language, and a tool it cannot express is not skipped - the
 * request is rejected. That makes the blast radius collective: conversion runs over the
 * *whole* tool set, so one unconvertible tool from any server strips the model of all of
 * them. The observable symptom is an assistant that answers every message with a schema
 * error while every MCP server is live and healthy.
 *
 * Four defects are handled, all present in commercetools' Managed MCP Server today. Which of
 * them a project hits depends on which tools it has enabled, and each one alone is enough to
 * break every message - so this list grew as the enabled tool set did. (1) and (2) were found
 * on a 48-tool server; (3) and (4) only showed up at 135 tools, in one tool each:
 *
 *  1. **References Google will not resolve.** `@ai-sdk/google` bridges JSON Schema by
 *     inlining `$ref`s, and rejects any that is not a direct child of root
 *     `$defs`/`definitions` ("Google schema conversion only supports references to direct
 *     children of root-level $defs or definitions") or that resolves back into itself
 *     ("...does not support recursive JSON Schema references"). The product search query
 *     tree has both: sibling operators point at
 *     `#/properties/query/properties/fullText`, and sub-queries nest with
 *     `items: { $ref: '#/properties/query' }`. The update tools reference far deeper still,
 *     e.g. `#/properties/actions/items/anyOf/1/properties/agreement/properties/name`.
 *
 *  2. **Arrays with no element type.** `{ "type": "array" }` is valid JSON Schema meaning
 *     "an array of anything", but the Gemini API rejects it with
 *     `...properties[values].items: missing field`. The search operators declare `values`
 *     exactly that way.
 *
 *  3. **Tuples.** `items: [A, B]` types an array per position. Gemini's `items` is a single
 *     schema and the provider forwards the list form unchanged, so the API rejects the
 *     request with `Proto field is not repeating, cannot start list`. `update_channels`
 *     models a GeoJSON `coordinates` pair that way - one node, in one tool, and it took down
 *     all 135. The same defect reaches us through zod for the in-process commerce agent; see
 *     client/legacy-tool-schema.ts, which makes the same trade in the zod layer.
 *
 *  4. **Reference cycles made of required fields.** Gemini accepts recursion, but only where
 *     the loop passes through an optional or nullable property or a possibly-empty array:
 *     "...but a ref loop of required fields was found at ...properties.elementType".
 *     `update_types` and `update_product_types` declare `attributeType.set.elementType` -
 *     another `attributeType` - as required. Handled by {@link relaxRequiredRefCycles}, and
 *     again there is a zod-layer twin, `breakRequiredRefCycles` in
 *     client/legacy-tool-schema.ts, for the same commercetools type.
 *
 * All four are the server's to fix; until it does, rewriting here is what keeps the tool set
 * usable. Worth re-checking against a future Managed MCP Server release - if the schemas
 * are corrected upstream, {@link needsGeminiNormalization} starts returning false and this
 * becomes a no-op rather than something to remove.
 *
 * Reported upstream: docs/upstream/managed-mcp-gemini-schema-incompatibility.md, which
 * carries the verbatim `tools/list` schema and the exact errors.
 *
 * TWO STRATEGIES LIVE HERE, and the one that preserves the schema is the default.
 *
 * {@link hoistRefsForGemini} moves each `$ref` TARGET into root `$defs` and points the
 * references at it there. It changes no structure - a cycle stays a cycle, nothing is
 * expanded or dropped, the schema keeps its size. That is enough because `@ai-sdk/google`
 * 4.0.52 added a raw pass-through: when conversion hits a *recursive* reference it abandons
 * conversion and sends `parametersJsonSchema` with the schema untouched (see
 * `prepareFunctionDeclaration` in the provider's google-prepare-tools.ts). The raw schema
 * never reaches that branch, because every one of its `$ref`s is a `#/properties/...`
 * pointer and those fail the earlier root-`$defs` check with a different error that is
 * rethrown. Hoisting makes the cycle the first thing conversion trips on, so Gemini receives
 * the whole schema verbatim - and its full-JSON-Schema field accepts the item-less arrays and
 * the recursion that the restricted one rejects.
 *
 * {@link normalizeJsonSchemaForGemini} is the lossy fallback, used only when hoisting leaves
 * a reference the provider still cannot resolve ({@link hasUnresolvableRef}). It inlines the
 * references and cuts recursion after one expansion, which grows `read_product_search` from
 * 4.6kB to 21.6kB of function declarations - and Gemini rejects that under FORCED tool choice
 * (`toolChoice: 'required'` or a named tool - the API's `ANY` mode) with a bare "Request
 * contains an invalid argument". So a tool that falls back is usable only under
 * `toolChoice: 'auto'`, which is what every agent carrying MCP tools uses today.
 *
 * Measured rather than assumed. Each strategy was sent to live models on 2026-09-11 with
 * `@ai-sdk/google@4.0.63`, over both `read_product_search` alone and a full 135-tool server,
 * with identical results on gemini-3-flash-preview, 3.5-flash, 3.7-flash and 3.8-flash:
 *
 *   - raw is rejected by the provider before any HTTP call, on both tool sets;
 *   - hoisted is accepted, and is the only strategy that gets schemas to Gemini unmodified
 *     (3 of the 135 tools take the pass-through - the ones with genuine cycles);
 *   - the fallback is accepted too, at ~5x the size per affected tool (4.6kB -> 21.6kB for
 *     `read_product_search`).
 *
 * Note what that list does NOT cover: whether the model *behaves* better with a preserved
 * recursive query tree than with a truncated one. Only request acceptance and payload size
 * were measured.
 *
 * Re-check after a provider bump, a Managed MCP release, or a change to which tools a project
 * enables - the defect set depends on the enabled tools, which is how (3) and (4) went
 * unnoticed until a 135-tool server appeared. A tool that Gemini refuses fails the whole turn,
 * and utils/tool-schema-debug.ts will NOT attribute it (it only catches zod serialization
 * failures), so the symptom is every message failing with a schema error naming no tool.
 *
 * SEPARATE LIMIT, not a schema problem: forced tool choice (`toolChoice: 'required'` or a
 * named tool - the API's `ANY` mode) fails on the SIZE of the declaration payload, whatever
 * the strategy. The same hoisted schemas pass forced mode at 10 tools / 34kB and are rejected
 * at 30 tools / 295kB with a contentless "Request contains an invalid argument"; a single
 * 21.6kB flattened declaration is rejected on its own. `auto` accepts all 135 at 1.24MB. This
 * does not bite today - every agent carrying MCP tools uses `auto` - but an agent that forces
 * a choice over a large MCP tool set will fail, and the error will not say why.
 *
 * Cost, for the same 135-tool server: the declarations alone are ~321k input tokens per
 * request (~2.4k per tool), against ~76k for 30 tools. Enabling everything is not free even
 * where it works.
 */

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** RFC 6901 token decoding: `~1` is `/`, `~0` is `~`, plus URI escaping. */
const decodePointerToken = (token: string): string =>
  decodeURIComponent(token).replace(/~1/g, '/').replace(/~0/g, '~');

/** The decoded path a local JSON Pointer walks. `#` is the root, i.e. no tokens. */
const pointerTokens = (ref: string): string[] =>
  ref === '#' ? [] : ref.slice(2).split('/').map(decodePointerToken);

/** Resolve a local JSON Pointer (`#/a/b`) against the document root. */
const resolvePointer = (root: unknown, ref: string): unknown => {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;

  let current: unknown = root;
  for (const token of pointerTokens(ref)) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[token];
    if (current === undefined) return undefined;
  }
  return current;
};

/**
 * Whether a `$ref` is one `@ai-sdk/google` will look at: a DIRECT child of root
 * `$defs`/`definitions`. Anything else - a deeper pointer, a nested `$defs`, a bare `#` -
 * is refused outright, whether or not it resolves.
 */
const isRootDefinitionRef = (ref: string): boolean =>
  (['#/$defs/', '#/definitions/'] as const).some((prefix) => {
    if (!ref.startsWith(prefix)) return false;
    const name = ref.slice(prefix.length);
    return name.length > 0 && !name.includes('/');
  });

/** Every distinct `$ref` reachable in a schema, wherever it appears. */
const collectRefs = (node: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRefs(item, found));
    return found;
  }
  if (!isPlainObject(node)) return found;

  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') found.add(value);
    else collectRefs(value, found);
  }
  return found;
};

/** Whether a schema node declares `array` among its type(s). */
const declaresArrayType = (node: Record<string, unknown>): boolean =>
  node.type === 'array' ||
  (Array.isArray(node.type) && node.type.includes('array'));

/** An array node the Gemini API will reject for having no element type. */
const isItemlessArray = (node: Record<string, unknown>): boolean =>
  declaresArrayType(node) && node.items === undefined;

/**
 * A TUPLE: per-position element schemas, as `items: [A, B]` (draft-07) or `prefixItems`
 * (2020-12). Gemini's `items` is a single schema, and the provider forwards the list form
 * unchanged, so the request dies with `Proto field is not repeating, cannot start list`.
 * `prefixItems` fares no better - the converter's keyword allowlist drops it silently, which
 * leaves an array with no element type at all.
 */
const hasTupleItems = (node: Record<string, unknown>): boolean =>
  Array.isArray(node.items) || Array.isArray(node.prefixItems);

const tuplePositions = (
  node: Record<string, unknown>
): unknown[] | undefined => {
  if (Array.isArray(node.prefixItems)) return node.prefixItems;
  return Array.isArray(node.items) ? node.items : undefined;
};

// Where the "and the rest" schema lives differs by draft: 2020-12 puts it in `items`
// alongside `prefixItems`, draft-07 in `additionalItems`.
const tupleRest = (node: Record<string, unknown>): JsonObject | undefined => {
  const rest = Array.isArray(node.prefixItems)
    ? node.items
    : node.additionalItems;
  return isPlainObject(rest) ? rest : undefined;
};

const collapsedItemSchema = (candidates: JsonObject[]): unknown => {
  if (candidates.length === 0) return {};

  const uniform = candidates.every(
    (candidate) => JSON.stringify(candidate) === JSON.stringify(candidates[0])
  );
  return uniform ? candidates[0] : { anyOf: candidates };
};

/**
 * Rewrite a tuple as a length-bounded array of one element type.
 *
 * Same trade as the zod-layer fix in client/legacy-tool-schema.ts, and for the same schema:
 * commercetools models a GeoJSON `coordinates` pair as a two-number tuple. Arity moves to
 * `minItems`/`maxItems` and the element type becomes the shared schema, or a union of the
 * positions when they differ. Gemini's restricted schema drops the bounds, so per-position
 * typing is genuinely lost there - but the tool handler and the commercetools API still
 * enforce it, and the alternative is the whole tool set failing.
 */
const collapseTupleItems = (node: Record<string, unknown>): void => {
  const positional = tuplePositions(node);
  if (!positional) return;

  const rest = tupleRest(node);
  const candidates = [...positional, ...(rest ? [rest] : [])].filter(
    isPlainObject
  );

  delete node.prefixItems;
  delete node.additionalItems;
  node.items = collapsedItemSchema(candidates);

  if (node.minItems === undefined) node.minItems = positional.length;
  if (!rest && node.maxItems === undefined) node.maxItems = positional.length;
};

/**
 * Every array fix, applied to ONE node. Order matters: collapsing a `prefixItems` tuple is
 * what gives that array an element type, so filling in the untyped one has to come second.
 */
const fixArrayNode = (node: Record<string, unknown>): void => {
  collapseTupleItems(node);
  if (isItemlessArray(node)) node.items = {};
};

/**
 * Marker for a subschema that cannot be represented - a cycle, or a `$ref` that does not
 * resolve. The parent drops it rather than emitting a placeholder: an empty
 * `{ type: 'object' }` is itself rejected by the Gemini API, which requires OBJECT schemas
 * to declare properties.
 */
const DROP = Symbol('unrepresentable-subschema');

type Visited = typeof DROP | unknown;

/** A `$defs` key derived from a pointer, unique within `taken`. */
const defNameFor = (ref: string, taken: Set<string>): string => {
  // `properties`/`items` are structural noise in a pointer; what is left reads as a name, so
  // `#/properties/query/properties/fullText` becomes `query_fullText`.
  const parts = pointerTokens(ref).filter(
    (token) => !['properties', 'items', '$defs', 'definitions'].includes(token)
  );
  const base = (parts.join('_') || 'root').replace(/[^A-Za-z0-9_]/g, '_');

  let name = base;
  let suffix = 2;
  while (taken.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  taken.add(name);
  return name;
};

/** Replace whatever a pointer addresses. Never called with `#`; the caller handles the root. */
const setAtPointer = (root: unknown, ref: string, value: unknown): void => {
  const tokens = pointerTokens(ref);
  let current: unknown = root;
  for (const token of tokens.slice(0, -1)) {
    current =
      isPlainObject(current) || Array.isArray(current)
        ? (current as JsonObject)[token]
        : undefined;
  }
  if (isPlainObject(current) || Array.isArray(current)) {
    (current as JsonObject)[tokens[tokens.length - 1]] = value;
  }
};

const rewriteRef = (node: unknown, from: string, to: string): void => {
  if (Array.isArray(node)) {
    node.forEach((item) => rewriteRef(item, from, to));
    return;
  }
  if (!isPlainObject(node)) return;

  if (node.$ref === from) node.$ref = to;
  for (const value of Object.values(node)) rewriteRef(value, from, to);
};

/** {@link fixArrayNode} over a whole document. */
const fixArrays = (node: unknown): void => {
  if (Array.isArray(node)) {
    node.forEach(fixArrays);
    return;
  }
  if (!isPlainObject(node)) return;

  fixArrayNode(node);
  // Read the values AFTER fixing: collapsing a tuple replaces `items`, and the replacement
  // is what needs descending into.
  for (const value of Object.values(node)) fixArrays(value);
};

/** The `$defs` name a root-definition `$ref` names. */
const defNameOf = (ref: string): string =>
  ref.slice(
    ref.startsWith('#/$defs/') ? '#/$defs/'.length : '#/definitions/'.length
  );

/**
 * The `$defs` entries that can reach themselves through references, i.e. the genuine cycles.
 *
 * Needed because hoisting turns *every* shared subschema into a `$ref`, cyclic or not. The
 * relaxation below must only touch the cyclic ones - loosening `required` on an ordinary
 * shared field would tell the model a required argument is optional.
 */
const cyclicDefNames = (root: JsonObject): Set<string> => {
  const defs = isPlainObject(root.$defs) ? root.$defs : {};

  const edges = new Map<string, string[]>(
    Object.entries(defs).map(([name, schema]) => [
      name,
      [...collectRefs(schema)].filter(isRootDefinitionRef).map(defNameOf),
    ])
  );

  const cyclic = new Set<string>();
  for (const start of edges.keys()) {
    const seen = new Set<string>();
    const stack = [...(edges.get(start) ?? [])];
    while (stack.length) {
      const next = stack.pop() as string;
      if (next === start) {
        cyclic.add(start);
        break;
      }
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(edges.get(next) ?? []));
    }
  }
  return cyclic;
};

const isCyclicRefProperty = (
  property: unknown,
  cyclic: ReadonlySet<string>
): boolean => {
  if (!isPlainObject(property)) return false;

  const ref = property.$ref;
  return (
    typeof ref === 'string' &&
    isRootDefinitionRef(ref) &&
    cyclic.has(defNameOf(ref))
  );
};

const dropCyclicRequired = (
  node: JsonObject,
  cyclic: ReadonlySet<string>
): void => {
  if (!Array.isArray(node.required) || !isPlainObject(node.properties)) return;

  const properties = node.properties;
  const kept = (node.required as unknown[]).filter(
    (name) =>
      !isCyclicRefProperty(
        typeof name === 'string' ? properties[name] : undefined,
        cyclic
      )
  );
  if (kept.length === 0) delete node.required;
  else node.required = kept;
};

const walkRelaxingRequired = (
  node: unknown,
  cyclic: ReadonlySet<string>
): void => {
  if (Array.isArray(node)) {
    node.forEach((item) => walkRelaxingRequired(item, cyclic));
    return;
  }
  if (!isPlainObject(node)) return;

  dropCyclicRequired(node, cyclic);
  for (const value of Object.values(node)) walkRelaxingRequired(value, cyclic);
};

/**
 * Drop `required` entries whose value is a reference into a CYCLE.
 *
 * Gemini accepts a self-referential schema only where the loop passes through an optional or
 * nullable property, or a possibly-empty array. A loop made of required fields is refused:
 *
 *   "ref loops are only supported if they include optional or nullable property values, or a
 *    potentially-zero-length array items, but a ref loop of required fields was found at
 *    $defs.…_elementType.anyOf.10.properties.elementType"
 *
 * `update_types` and `update_product_types` have exactly that shape - an `attributeType`
 * union whose `set` member declares `elementType: attributeType` as required - and because
 * every tool ships in one request it took down all 135, not just those two.
 *
 * Dropping the property from `required` is safe in the way that matters: the Managed MCP
 * Server and the commercetools API still reject a `set` attribute with no `elementType`. This
 * is the same trade `breakRequiredRefCycles` makes for the zod-authored tools in
 * client/legacy-tool-schema.ts; the difference is that this one has to identify the cycles
 * first, because hoisting emits references for non-cyclic shared schemas too.
 */
const relaxRequiredRefCycles = (root: JsonObject): void => {
  const cyclic = cyclicDefNames(root);
  if (cyclic.size === 0) return;

  walkRelaxingRequired(root, cyclic);
};

/** Move what one pointer addresses into `$defs` and point every use of it there. */
const hoistPointer = (
  out: JsonObject,
  defs: JsonObject,
  taken: Set<string>,
  ref: string
): void => {
  const target = resolvePointer(out, ref);
  // Unresolvable: leave it alone. Inventing a target would hide a broken schema, and
  // `hasUnresolvableRef` below is what routes this schema to the lossy fallback instead.
  if (target === undefined) return;

  const name = defNameFor(ref, taken);
  const to = `#/$defs/${name}`;

  if (ref === '#') {
    // A whole-document self-reference. The document becomes a reference to itself under
    // `$defs`, which is the same shape one level down.
    const body = Object.fromEntries(
      Object.entries(out).filter(([key]) => key !== '$defs')
    );
    defs[name] = body;
    for (const key of Object.keys(out)) if (key !== '$defs') delete out[key];
    out.$ref = to;
  } else {
    defs[name] = target;
    setAtPointer(out, ref, { $ref: to });
  }

  rewriteRef(out, ref, to);
};

/**
 * Make a schema acceptable to Gemini without changing what it describes.
 *
 * Every `$ref` target moves into root `$defs` and the references point at it there; item-less
 * arrays gain `items: {}`. No subschema is expanded, dropped or retyped, so a recursive query
 * tree stays fully recursive and the schema keeps its original size - the whole point, since
 * the alternative ({@link normalizeJsonSchemaForGemini}) costs both.
 *
 * Two routes out of here, and both end somewhere Gemini accepts:
 *
 *  - the schema has a CYCLE, so conversion trips on a recursive reference and the provider
 *    forwards the schema verbatim as `parametersJsonSchema`. Gemini's full-JSON-Schema field
 *    takes `$defs`, cycles and untyped arrays;
 *  - the schema has no cycle, so conversion now succeeds (the references resolve) and emits
 *    the restricted form. That form rejects a bare `{ "type": "array" }`, which is why
 *    `items: {}` is filled in here rather than left to the pass-through.
 *
 * Targets are hoisted deepest-first: `#/properties/query/properties/fullText` lives inside
 * `#/properties/query`, so the inner one has to move before the outer one, or the outer
 * `$defs` entry carries a stale inline copy of it.
 */
export function hoistRefsForGemini<T>(root: T): T {
  if (!isPlainObject(root)) return root;

  const out = structuredClone(root) as JsonObject;
  const defs: JsonObject = isPlainObject(out.$defs) ? out.$defs : {};
  out.$defs = defs;
  const taken = new Set(Object.keys(defs));

  const pointers = [...collectRefs(out)]
    .filter((ref) => !isRootDefinitionRef(ref))
    .sort((a, b) => pointerTokens(b).length - pointerTokens(a).length);

  for (const ref of pointers) hoistPointer(out, defs, taken, ref);

  if (Object.keys(defs).length === 0) delete out.$defs;
  fixArrays(out);
  relaxRequiredRefCycles(out);

  return out as T;
}

/**
 * Whether a schema still carries a reference `@ai-sdk/google` will refuse to look at.
 *
 * Run on the OUTPUT of {@link hoistRefsForGemini} to decide whether the hoist was enough.
 * A cycle is fine here - that is the pass-through trigger, not a problem - so this asks only
 * the narrower question the provider's non-recursive error answers: is every `$ref` a root
 * `$defs`/`definitions` child that actually resolves?
 */
export function hasUnresolvableRef(root: unknown): boolean {
  return [...collectRefs(root)].some(
    (ref) =>
      !isRootDefinitionRef(ref) || resolvePointer(root, ref) === undefined
  );
}

const inlineRef = (
  root: unknown,
  node: JsonObject,
  ref: string,
  expanding: ReadonlySet<string>
): Visited => {
  // A `$ref` we are already inside is a cycle; stop here.
  if (expanding.has(ref)) return DROP;

  const target = resolvePointer(root, ref);
  if (target === undefined) return DROP;

  const siblings = { ...node };
  delete siblings.$ref;

  // Boolean schemas: `true` accepts anything (keep the siblings), `false` accepts
  // nothing (indistinguishable from unrepresentable, for our purposes).
  if (typeof target === 'boolean') return target ? siblings : DROP;
  if (!isPlainObject(target)) return DROP;

  // Sibling keywords alongside `$ref` win, matching the 2020-12 behaviour that
  // `@ai-sdk/google` itself implements.
  return inlineSchema(
    root,
    { ...target, ...siblings },
    new Set([...expanding, ref])
  );
};

const inlineProperties = (
  root: unknown,
  value: JsonObject,
  expanding: ReadonlySet<string>
): Record<string, unknown> => {
  const properties: Record<string, unknown> = {};
  for (const [name, subSchema] of Object.entries(value)) {
    const visited = inlineSchema(root, subSchema, expanding);
    if (visited !== DROP) properties[name] = visited;
  }
  return properties;
};

/** The combinator branches that survive; `undefined` when none do. */
const inlineBranches = (
  root: unknown,
  branches: unknown[],
  expanding: ReadonlySet<string>
): unknown[] | undefined => {
  const kept = branches
    .map((branch) => inlineSchema(root, branch, expanding))
    .filter((branch) => branch !== DROP);
  return kept.length === 0 ? undefined : kept;
};

/** Inline one key of a schema object into `out`. False means the whole node is dropped. */
const inlineEntry = (
  root: unknown,
  out: Record<string, unknown>,
  key: string,
  value: unknown,
  expanding: ReadonlySet<string>
): boolean => {
  // Every reference has been inlined, so the definition blocks are dead weight -
  // and leaving them behind would make the converter walk schemas nothing points at.
  if (key === '$defs' || key === 'definitions') return true;

  if (key === 'properties' && isPlainObject(value)) {
    out.properties = inlineProperties(root, value, expanding);
    return true;
  }

  if (
    (key === 'anyOf' || key === 'oneOf' || key === 'allOf') &&
    Array.isArray(value)
  ) {
    const kept = inlineBranches(root, value, expanding);
    if (!kept) return false;
    out[key] = kept;
    return true;
  }

  const visited = inlineSchema(root, value, expanding);
  if (visited !== DROP) {
    out[key] = visited;
    return true;
  }
  // An array whose element type is unrepresentable is not usable, so the array
  // itself goes rather than becoming an untyped list.
  if (key === 'items') return false;
  if (key === 'additionalProperties') out[key] = false;
  return true;
};

/** A property listed as required but dropped would make the schema unsatisfiable. */
const pruneDroppedRequired = (out: Record<string, unknown>): void => {
  if (!Array.isArray(out.required) || !isPlainObject(out.properties)) return;

  const properties = out.properties;
  const required = out.required.filter(
    (name) => typeof name === 'string' && name in properties
  );
  if (required.length === 0) delete out.required;
  else out.required = required;
};

const inlineSchema = (
  root: unknown,
  node: unknown,
  expanding: ReadonlySet<string>
): Visited => {
  if (Array.isArray(node)) {
    return node.map((item) => inlineSchema(root, item, expanding));
  }
  if (!isPlainObject(node)) return node;

  const ref = node.$ref;
  if (typeof ref === 'string') return inlineRef(root, node, ref, expanding);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!inlineEntry(root, out, key, value, expanding)) return DROP;
  }

  // `{}` rather than a concrete element type: the source said "array of anything", and
  // narrowing it here would silently forbid values the server does accept. A tuple is
  // collapsed to one element type in the same pass - see fixArrayNode.
  fixArrayNode(out);
  pruneDroppedRequired(out);

  return out;
};

/**
 * Rewrite a JSON Schema into the subset Gemini's function calling accepts.
 *
 * The LOSSY fallback - prefer {@link hoistRefsForGemini}, which preserves both the recursion
 * and the size. This is for schemas whose references cannot be hoisted into something the
 * provider will resolve; it keeps such a tool usable at the cost of depth, size, and forced
 * tool choice.
 *
 * Local `$ref`s are inlined, cutting recursion where it closes: the cycle is expanded once
 * and the self-referencing property is dropped at the second level, so
 * `read_product_search` keeps `query.and` with a fully described element type and only
 * loses the ability to nest a third level of sub-queries. Item-less arrays gain
 * `items: {}`, which is the untyped element schema the API accepts and matches what the
 * original `{ "type": "array" }` meant.
 *
 * Non-recursive `$defs` would convert on their own, but they are inlined too so there is
 * one code path and no definition block left dangling once its only referrer is gone.
 */
export function normalizeJsonSchemaForGemini<T>(root: T): T {
  if (!isPlainObject(root)) return root;

  const result = inlineSchema(root, root, new Set<string>());
  return (result === DROP ? { type: 'object', properties: {} } : result) as T;
}

const refNeedsNormalization = (
  root: unknown,
  ref: string,
  expanding: ReadonlySet<string>
): boolean => {
  if (expanding.has(ref) || !isRootDefinitionRef(ref)) return true;

  const target = resolvePointer(root, ref);
  if (target === undefined) return true;

  return needsNormalizationWalk(root, target, new Set([...expanding, ref]));
};

const needsNormalizationWalk = (
  root: unknown,
  node: unknown,
  expanding: ReadonlySet<string>
): boolean => {
  if (Array.isArray(node)) {
    return node.some((item) => needsNormalizationWalk(root, item, expanding));
  }
  if (!isPlainObject(node)) return false;

  if (isItemlessArray(node) || hasTupleItems(node)) return true;

  const ref = node.$ref;
  if (typeof ref === 'string')
    return refNeedsNormalization(root, ref, expanding);

  return Object.entries(node).some(([key, value]) =>
    key === '$defs' || key === 'definitions'
      ? false
      : needsNormalizationWalk(root, value, expanding)
  );
};

/**
 * Whether a schema contains anything either strategy would rewrite.
 *
 * Used only to decide whether to rewrite at all, so the common case - a server whose
 * schemas are already fine, which is most of them - costs one read-only walk and keeps its
 * original schema object. Note this reports a cycle as needing work even though
 * {@link hoistRefsForGemini} deliberately keeps cycles: a cycle behind a `#/properties/...`
 * pointer still has to be hoisted before the provider will forward it.
 */
export function needsGeminiNormalization(root: unknown): boolean {
  if (!isPlainObject(root)) return false;
  return needsNormalizationWalk(root, root, new Set<string>());
}
