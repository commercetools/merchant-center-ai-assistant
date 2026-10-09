## ADDED Requirements

### Requirement: JSON-schema normalisation for Gemini
`service/src/schema/json-schema.ts` SHALL export `needsGeminiNormalization`, `hoistRefsForGemini`, `hasUnresolvableRef`, `normalizeJsonSchemaForGemini` with the behaviour of the legacy `utils/json-schema.utils.ts`: hoist `$ref` targets into root `$defs` keeping cycles, give item-less arrays an untyped `items`, collapse tuples (`items: []` and `prefixItems`) to a bounded array, relax required `$ref` cycles, fall back to the flattening normaliser when a ref cannot be hoisted. All functions are pure and MUST NOT mutate their input.

#### Scenario: Pointer refs
- **WHEN** a schema has `$ref: '#/properties/query/properties/fullText'`
- **THEN** after hoisting every `$ref` is a direct child of root `$defs`

#### Scenario: Tuple
- **WHEN** a schema declares `items: [A, B]`
- **THEN** the result has a single `items` schema and `minItems`/`maxItems` of 2

#### Scenario: No-op
- **WHEN** a schema has no refs, bare arrays or tuples
- **THEN** `needsGeminiNormalization` is false and the schema is returned unchanged

### Requirement: Zod-layer normalisation
`service/src/schema/legacy-tool-schema.ts` SHALL export `normalizeToolSchema`, `sanitizeToolSchemaForProvider`, `resolveLegacyInputSchema`, `adaptLegacyToolSet` with legacy semantics (`parameters` moved to `inputSchema`; `z.record(z.any())` repaired; `z.tuple` rewritten as bounded array; required `$ref` cycles broken for serialisation only while validation keeps the original schema).

#### Scenario: Legacy parameters
- **WHEN** a tool only has `parameters`
- **THEN** the adapted tool has `inputSchema` and no `parameters`

#### Scenario: Validation preserved
- **WHEN** a cyclic schema is sanitised
- **THEN** invalid input is still rejected by the tool's validator

### Requirement: Central application
The registry SHALL run `normalizeToolSet(tools)` once on the merged tool set before it is given to any agent, applying `hoistRefsForGemini` (falling back to `normalizeJsonSchemaForGemini` when `hasUnresolvableRef`) to every tool whose JSON schema `needsGeminiNormalization`; the function MUST be idempotent and MUST NOT throw (a tool whose schema cannot be processed is left as is and logged by name).

#### Scenario: Idempotent
- **WHEN** `normalizeToolSet` is applied twice
- **THEN** the second result deep-equals the first

#### Scenario: Broken tool is named
- **WHEN** a tool's schema cannot be serialised
- **THEN** the log names the tool and the other tools are unaffected
