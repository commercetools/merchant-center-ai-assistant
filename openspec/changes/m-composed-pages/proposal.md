## Why

Users ask the assistant for dashboards and custom pages. The multitenant router answers with a `create_composed_page` tool (950 lines) that validates model-written JSX, transpiles it with Babel and returns a v5.0 page schema which the Merchant Center frontend renders and stores. The tool works, but its contract with the frontends is implicit and partly broken: the server's transpiled code is rejected by the client's `hasReturnStatement` check whenever a component uses hooks (so the client silently re-transpiles), the validation is substring based (`includes('return ')`, regex deny-list), the tool description says "version 4.0" while the schema is 5.0, and the storage container name is a string constant duplicated in two frontends. This change ports the tool, its prompt and the Nimbus scope, and turns the implicit contract into one tested, versioned, shared definition that frontends P, R and O consume.

## What Changes

- **Change ID: M** (`m-composed-pages`). **Needs:** H (`ToolSource` registry, `STORABLE_TOOLS` keeps `create_composed_page`, flat orchestrator). Unblocks: P, R, T, V. Pairs with K (Nimbus MCP tools are the model's documentation lookup) and L (`query_aggregated_data` is provided by L's source; M must not re-provide it).
- Port the `create_composed_page` tool as a `commercetools-ui` **ToolSource** (order 60): zod input schema, validation, Babel (classic runtime) transpile, v5.0 output `{ uri, schema }`.
- **Contract (new, normative):** one module `composed-page-contract` exporting the schema version, the `ui://composed-page/{key}/v{n}` URI builder and parser, the Custom Object container key (`shared-composed-pages`, default kept, owner question), the stored value shape, and the code encoding rules (base64 `code.text` and `code.transpiledCode`, transpiled code shaped `function Name({ renderData, dispatchUIAction }) {...}\nName;`). Frontends copy the types from a generated JSON fixture, validated by a shared contract test.
- **Hardening:** AST-based validation (top-level `return` detection, forbidden identifiers/member access, no imports/exports, no function wrapper) replacing substring checks; size caps; deterministic error hints back to the model; correct description text ("5.0").
- Port `commercetools-ui.prompt.ts`, `nimbus-scope.ts` and the generated `nimbus-surface.generated.ts` with the generation script and the audit test; the committed surface manifest records `NIMBUS_VERSION` (read by K's pin test).
- Drop: per-agent definition wrapper (H's flat orchestrator), the "version 4.0" wording, server-side storage (the frontend stores pages through MC GraphQL; the tool never writes Custom Objects).

## Capabilities

### New Capabilities
- `composed-page-tool`: the `create_composed_page` tool, its input schema, validation, transpile and output.
- `composed-page-contract`: the shared, versioned page schema, URI, storage container and code-encoding contract for the service and the frontends.
- `nimbus-scope-prompt`: the UI-agent system prompt, the generated Nimbus scope/surface manifest, and the audit that keeps the advertised scope renderable.

### Modified Capabilities
<!-- none -->

## Impact

- New code under `service/src/composed-pages/{contract,schema,validate,transpile,tool,tool-source}.ts`, `service/src/composed-pages/prompt/{commercetools-ui.prompt,nimbus-scope,nimbus-surface.generated}.ts`, `service/scripts/generate-nimbus-surface.mjs`, `service/tests/composed-pages/**`, a shared fixture `contract/composed-page.fixture.json`.
- Dependencies: `@babel/core`, `@babel/preset-react` (and `@babel/parser`/`@babel/traverse` already transitive; pinned exactly). First server transpile costs ~370 ms and about 90 MB RSS with Babel loaded (measured 2026-10-08), so Babel is loaded lazily on the first call.
- Config: none new. Frontend-facing constants (container key) are exported from the contract module; no env vars.
- Consumers: H (registers the source, keeps tool name), K (reads `NIMBUS_VERSION` from the surface manifest), P/R/O/T (types and fixture, `hasReturnStatement` fix), V (E2E-M-*).

## Out of scope

- Rendering, preview, saving, publishing, annotation UI (P, R, S) - the contract stays version-discriminated.
- Writing or reading Custom Objects from the service (frontend does it through MC GraphQL).
- Nimbus MCP process management (K) and `query_aggregated_data` (L).

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
`src/functional-agent/tools/composed-page.tool.ts`, `src/functional-agent/agents/prompts/{commercetools-ui.prompt.ts,nimbus-scope.ts,nimbus-surface.generated.ts}`, `src/functional-agent/agents/definitions/commercetools-ui.agent.ts`, `tests/prompts/nimbus-scope.spec.ts`, `scripts/generate-nimbus-surface.mjs`; frontend contract in `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/` (`mc-app/src/types/composed-page.ts`, `use-composed-pages-storage.ts`, `babel-renderer.tsx`, `gen-ui-part.tsx`, composed-apps `constants.ts`).
