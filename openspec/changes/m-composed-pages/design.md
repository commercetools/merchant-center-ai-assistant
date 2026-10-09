## Context

The legacy router exposes `create_composed_page`: the model writes React component bodies and GraphQL data sources, the server validates and transpiles them and returns a v5.0 page schema which the Merchant Center frontend renders (Babel scope + `new Function`) and stores in Custom Objects. This change ports the tool, prompt and Nimbus scope into the single-tenant service and makes the frontend contract explicit and tested. Frontends P (mc-app chat), R (composed-apps), S, O and T depend on the contract.

## Goals / Non-Goals

- Goals: same user-visible behaviour; one shared contract module and fixture; correct validation (AST); fix the transpile/`hasReturnStatement` mismatch; keep tool name and URI scheme; lazy Babel.
- Non-goals: rendering, storage from the service, SQL tooling, Nimbus child process.

## Explore findings

1. Legacy tool `tools/composed-page.tool.ts` (950 lines): zod schemas (GraphQLVariable, DataSource with `target` enum of only `COMMERCETOOLS_PLATFORM`, ImportDefinition, ComponentDefinition with PascalCase name and `componentBody`); validation by substring/regex: required react import, GraphQL query must start with `query` or `{`, forbidden patterns `eval`, `new Function`, `document.`, `window.`, no function wrapper/imports, and `hasReturnStatement` = `includes('return ')`.
2. Wrapping: `wrapInNamedComponent` produces `function Name({ renderData, dispatchUIAction }) {...}\nName;`; Babel classic runtime; `code.text` and `code.transpiledCode` base64. Output `{ uri: ui://composed-page/${key}/v${version}, schema: { version:'5.0', title, description, components, props } }`. The tool description says "version 4.0" (stale).
3. Frontend `gen-ui-part.tsx` detects `ui://` plus `schema.version === '5.0'` and `components[]`; version number from `/\/v(\d+)$/`.
4. Frontend `use-composed-pages-storage.ts` writes Custom Objects itself via MC GraphQL: `SHARED_COMPOSED_PAGES_CONTAINER_KEY = 'shared-composed-pages'` (duplicated in mc-app and composed-apps constants), key = client UUID, value `{ name, icon, schema, isPublished, createdBy }`. The service never stores pages. `createdBy` may be personal data (see R design).
5. Frontend `babel-renderer.tsx` decodes base64, accepts the server `transpiledCode` only if its own `hasReturnStatement` regex matches (body must START with `return`), else re-transpiles in the browser with Babel standalone. CSP allows `unsafe-eval`; execution is `new Function` with scope from Nimbus, react and react-router-dom.
6. **Measured 2026-10-08 (Babel from the legacy service deps):** the legacy wrapping is accepted by the client check for a pure-return component but rejected for a body with hooks, so hooks pages are always re-transpiled client side. The server work is wasted and the "transpile on server" claim is false for the common case. Fix: define the contract as "script whose last statement is the component identifier" and check with a parser or a stable marker, not a `return` regex (task for P/R/O, amendment recorded).
7. **Measured:** first Babel transform 369 ms, subsequent 2 ms; process RSS 92 MB with Babel loaded (Connect limit 512 MB) - load lazily.
8. Prompt files `commercetools-ui.prompt.ts` (374 lines), `nimbus-scope.ts` (356), `nimbus-surface.generated.ts` (191) are used only by the tool and by `tests/prompts/nimbus-scope.spec.ts` (imports `composedPageTool`); H finding 15 assigns them to M. `NIMBUS_VERSION` in the manifest is 3.5.1 in legacy and is generated from the mc-app's dependency by `generate-nimbus-surface.mjs`.
9. The legacy agent definition `commercetools-ui.agent.ts` is dead code under H's flat orchestrator (H D-H1); only the prompt matters.
10. H D-H10: `create_composed_page` is in `STORABLE_TOOLS` and must keep its name. L provides `query_aggregated_data`; the prompt only references it by constant.
11. K reads the surface manifest `NIMBUS_VERSION` to pin `@commercetools/nimbus-mcp` (its test). The contract must stay version-discriminated.

## Glossary

- **Composed page**: model-authored page: components, data sources, props.
- **Component body**: JSX function body written by the model, no imports, ends with a top-level `return`.
- **Contract module**: `composed-pages/contract.ts`; the only definition of schema version, URI, container key and encoding.
- **Surface manifest**: generated file listing Nimbus exports, compounds and parts.
- **Compound component**: Nimbus export that is a namespace object (`Card.Root`), not a component.
- **Container**: Custom Object container `shared-composed-pages`.

## Source map

| Legacy (`.../service/src/functional-agent/`) | New (`service/src/composed-pages/`) | Verdict |
|---|---|---|
| `tools/composed-page.tool.ts` zod schemas | `schema.ts` | KEEP, add caps |
| same, validation (substring/regex) | `validate.ts` (AST) | CHANGE |
| same, `wrapInNamedComponent`, Babel | `transpile.ts` (lazy) | KEEP, lazy |
| same, uri/output | `contract.ts`, `tool.ts` | CHANGE (contract module, previousVersion) |
| same, description text "4.0" | `tool.ts` | CHANGE |
| `agents/definitions/commercetools-ui.agent.ts` | `tool-source.ts` (ToolSource) | CHANGE |
| `agents/prompts/commercetools-ui.prompt.ts` | `prompt/commercetools-ui.prompt.ts` | KEEP, conditional Nimbus section |
| `agents/prompts/nimbus-scope.ts` | `prompt/nimbus-scope.ts` | KEEP |
| `agents/prompts/nimbus-surface.generated.ts` | `prompt/nimbus-surface.generated.ts` | KEEP, regenerated |
| `scripts/generate-nimbus-surface.mjs` | `scripts/generate-nimbus-surface.mjs` | KEEP |
| `tests/prompts/nimbus-scope.spec.ts` | `tests/composed-pages/nimbus-scope.spec.ts` | KEEP |
| frontend `hasReturnStatement` regex (mc-app, composed-apps) | contract check `isUsableTranspiledCode` | CHANGE (amendment) |
| server-side page storage | none | DROP (frontend stores) |

## Decisions

**D-M1 Contract module and fixture.** One module and one generated JSON fixture are the contract. Alternatives: types duplicated per repo (drift is the current problem); an npm package shared by service and frontends (too heavy for a monorepo that ships separately). Fixture plus drift test chosen.

**D-M2 Keep container key `shared-composed-pages`.** Alternatives: rename to a deployment-neutral key such as `ai-assistant-composed-pages`. Greenfield single-tenant has no data to migrate, so renaming is cheap now and expensive later; but existing customers who used the legacy app cannot be assumed absent. Default: keep (zero risk; open question OQ-M1 below); the constant is the only definition.

**D-M3 Keep schema 5.0 and URI scheme.** The frontends parse `/\/v(\d+)$/`; T adds a version through the union.

**D-M4 AST validation.** Parse the body wrapped in a function with `@babel/parser` (JSX), walk for identifiers/members. Alternative: keep regex (false positives on strings, bypass via `window ["x"]`, `globalThis`). Not a security boundary: model output is untrusted, code runs in the user's browser inside MC with `unsafe-eval`; the real mitigations are the frontend's scope and that only the author's model produced it. Documented as defence in depth, risk R-M1.

**D-M5 Server transpile retained, contract fixed.** Alternative: drop server transpile and let the client always compile (smaller server, no 90 MB, no 370 ms). Kept because the legacy contract provides `transpiledCode` and P/R can load it without shipping Babel standalone later; but the server transpile is also the syntax check that gives the model errors in the same turn, which is the main value. Frontends get the fixed check.

**D-M6 `previousVersion` in input.** The legacy tool kept no version history. New: version = `previousVersion + 1` supplied by the model from the last `ui://` URI in conversation history; no server state. Alternative: server reads stored pages (needs Custom Object access; rejected).

**D-M7 ToolSource order 60, excluded from custom-view.** Matches H's selection.

**D-M8 Prompt Nimbus section conditional** on whether the `nimbus` source contributed tools (K), through H's prompt gating (prompt fragment only for contributing sources; M's prompt gets a sync flag from `ctx.hasTool('get_components')` or equivalent, task 5.3 reads H's context type).

**D-M9 Lazy Babel.** Alternative: preload at boot (adds ~370 ms and 90 MB at startup, hurts the 15 s sandbox boot budget).

## Risks / Trade-offs

- R-M1 Model-authored code executes in the browser (unsafe-eval). Mitigation: AST deny-list, scope restriction in frontend, no secrets in scope; documented.
- R-M2 Nimbus upgrades change names: generated manifest plus audit test plus K pin test.
- R-M3 Babel memory (about 90 MB) with K's child (about 96 MB cap) and Node baseline under 512 MB: measured sum fits but is tight; lazy load; monitor in smoke test.
- R-M4 Frontend repos (P/R/O) must adopt the corrected check; until then the behaviour equals legacy (client re-transpiles) so nothing breaks.
- R-M5 `createdBy` personal data in Custom Objects (frontend decision, R).
- R-M6 Model emits very large pages: caps 20 components / 20,000 characters each; Custom Object limit 16 MB is far away.

## Migration Plan

Greenfield: no data migration. If a maintainer chooses a new container key, no copy is needed.

## Open questions

- **OQ-M1** Keep `shared-composed-pages` or rename (default keep).
- **OQ-M3** Who regenerates the surface manifest when the mc-app upgrades Nimbus: default CI check in M fails, developer runs the script.
- **OQ-M4** Enforce deny-list as hard errors (default) or warnings.
