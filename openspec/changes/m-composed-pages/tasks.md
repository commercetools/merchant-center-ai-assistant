## 0. Read first

- [ ] 0.1 Read the context (45 min, no code)
      **Why:** the contract between server and frontends is implicit in three files.
      **Where:** this change's `proposal.md`, `design.md` (Explore findings 1-11, Decisions), `specs/*/spec.md`; legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/functional-agent/tools/composed-page.tool.ts` (whole), `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/functional-agent/agents/prompts/{commercetools-ui.prompt.ts,nimbus-scope.ts}`, `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/tests/prompts/nimbus-scope.spec.ts`; frontend `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/` files `mc-app/src/types/composed-page.ts`, `use-composed-pages-storage.ts`, `babel-renderer.tsx`, `gen-ui-part.tsx`.
      **Done when:** you can explain (1) who writes the Custom Object, (2) why hooks components were re-transpiled in the browser, (3) why Babel is loaded lazily, (4) what the URI version suffix is used for.
      **Watch out:** do not copy the "version 4.0" text.

- [ ] 0.2 Confirm dependencies
      **Why:** M plugs into H.
      **Where:** `service/src/`.
      **How:** find H's `ToolSource` type, `registerToolSource`, the custom-view source selection and `STORABLE_TOOLS`; find how a source reads whether another source contributed tools (prompt gating, design D-M8).
      **Done when:** `grep -rn "STORABLE_TOOLS\|registerToolSource\|customView" service/src | head` shows all three and `create_composed_page` is in the list.
      **Watch out:** if the context cannot tell whether Nimbus tools exist, ask H's owner for `ctx.hasTool(name)` rather than reading env in M.

## 1. Setup

- [ ] 1.1 Skeleton and dependencies
      **Why:** fixed layout, exact pins.
      **Where:** create `service/src/composed-pages/{contract,schema,validate,transpile,tool,tool-source}.ts`, `service/src/composed-pages/prompt/`, `service/tests/composed-pages/`, `contract/` at repo root, `service/scripts/`; SPDX headers.
      **How:** `cd service && npm install --save-exact @babel/core @babel/preset-react @babel/parser @babel/traverse graphql` and the matching `--save-dev @types/babel__core @types/babel__traverse`.
      **Done when:** `npm run build` exits 0 and `node -e "require('@babel/core')"` exits 0.
      **Watch out:** runtime dependencies, not dev (Connect installs production deps).

## 2. Contract

- [ ] 2.1 Contract module
      **Why:** spec "Single exported contract module".
      **Where:** `composed-pages/contract.ts`; types from frontend `mc-app/src/types/composed-page.ts` (`TPageSchemaV5`, `TComposedPage`, `TRenderData`, `TUIAction`).
      **How:**
      ```ts
      export const COMPOSED_PAGE_SCHEMA_VERSION = '5.0' as const;
      export const COMPOSED_PAGES_CONTAINER_KEY = 'shared-composed-pages';
      const URI_RE = /^ui:\/\/composed-page\/([^/]+)\/v(\d+)$/;
      export const buildComposedPageUri = (key: string, v: number) => `ui://composed-page/${key}/v${v}`;
      export const parseComposedPageUri = (u: string) => { const m = URI_RE.exec(u); return m ? { key: m[1], version: Number(m[2]) } : null; };
      export const encodeCode = (s: string) => Buffer.from(s, 'utf8').toString('base64');
      export const decodeCode = (b: string) => Buffer.from(b, 'base64').toString('utf8');
      export const isSupportedSchema = (s: { version?: string }) => s.version === COMPOSED_PAGE_SCHEMA_VERSION;
      export function isUsableTranspiledCode(script: string, name: string): boolean { /* parse with @babel/parser; last statement is ExpressionStatement of Identifier name; first is FunctionDeclaration */ }
      ```
      **Done when:** `contract.spec.ts` covers URI round trip, malformed uri, hooks/pure/garbage cases from the spec; `npx jest tests/composed-pages/contract.spec.ts` green.
      **Watch out:** the module must import nothing from persistence or commercetools clients (a test scans imports).

## 3. Schema and validation

- [ ] 3.1 Zod input schema
      **Why:** spec "Input schema".
      **Where:** `schema.ts` from legacy `composed-page.tool.ts` zod section.
      **How:** port, add caps (20 components, 10 data sources, 20,000 chars body), optional `key` (uuid or safe slug), optional `previousVersion` (int >= 1), return `{path,message}[]` from a `safeParse` wrapper.
      **Done when:** tests for lowercase name, 21 components, duplicate names, bad target.
      **Watch out:** keep `target` enum single-valued but exported as a tuple so T can extend.

- [ ] 3.2 AST validator
      **Why:** spec "AST-based code validation".
      **Where:** `validate.ts`.
      **How:** `parse('(function(){' + body + '\n})', { plugins:['jsx'] })`; offset line numbers by 1. Walk with `@babel/traverse`: collect `Identifier` references (skip property keys and strings) against the deny-list; `MemberExpression` property `constructor`; `ImportDeclaration`/`ExportNamedDeclaration` are not parseable inside a function so catch the syntax error and map it to a friendly message; require a direct child `ReturnStatement` of the function body.
      **Done when:** all scenarios of the spec as tests (string containing "window" accepted, hook-only return rejected, real window rejected, unclosed JSX message with line/column).
      **Watch out:** a local variable named `document` shadowing is still rejected (simple and safe).

- [ ] 3.3 GraphQL data-source check
      **Why:** spec "GraphQL data sources".
      **Where:** `validate.ts`.
      **How:** `parse` from `graphql`; reject operations other than `query`; compare declared variable names with those in the zod `variables`.
      **Done when:** mutation rejected, valid query accepted, syntax error returns message.
      **Watch out:** anonymous `{ ... }` shorthand is a query.

## 4. Transpile and tool

- [ ] 4.1 Lazy transpiler
      **Why:** spec "Lazy transpiler and timing".
      **Where:** `transpile.ts`.
      **How:** `let babel; async function load(){ babel ??= await import('@babel/core'); }`; `transformAsync(wrapped, { presets:[[require.resolve('@babel/preset-react'),{runtime:'classic'}]], babelrc:false, configFile:false, compact:false })`; wrap with `Promise.race` 10 s.
      **Done when:** test asserts `require.cache` lacks `@babel/core` after importing the tool module and has it after the first call; transpiled output contains no `<` JSX tags.
      **Watch out:** `babelrc:false, configFile:false` or the repo's own Babel config leaks in.

- [ ] 4.2 The tool
      **Why:** spec "Transpile and output".
      **Where:** `tool.ts`, `tool-source.ts`.
      **How:** AI SDK `tool({ description, inputSchema, execute })`; execute: schema, validate, transpile, build `{ success:true, uri, schema }`; version rule from design D-M6; description generated with `NIMBUS_SCOPE_LINES` and says "5.0". ToolSource `{ name:'commercetools-ui', order:60, isEnabled:()=>true, getTools, listForMenu:()=>null, getPrompt }`; register after H's registry exists; exclude from custom-view selection (H's list).
      **Done when:** `tool.spec.ts`: new page uri `/v1`, edit `/v3`, error shapes, description mentions 5.0 not 4.0; source test: tool list is exactly `["create_composed_page"]`.
      **Watch out:** the tool returns errors as results so the model can retry in the same turn.

- [ ] 4.3 Shared fixture and drift test
      **Why:** spec "Shared fixture".
      **Where:** `contract/composed-page.fixture.json`, `tests/composed-pages/fixture.spec.ts`, script `npm run update:composed-page-fixture`.
      **How:** run the tool with fixed inputs and fixed key, write sorted JSON; the test regenerates and compares.
      **Done when:** fixture contains a hooks component and a pure component; drift test fails when you edit the wrapper.
      **Watch out:** no timestamps or random ids in the fixture.

## 5. Prompt and Nimbus scope

- [ ] 5.1 Port the surface manifest and generator
      **Why:** spec "Generated Nimbus surface manifest".
      **Where:** `prompt/nimbus-surface.generated.ts`, `service/scripts/generate-nimbus-surface.mjs` from legacy `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/scripts/generate-nimbus-surface.mjs`.
      **How:** copy, point the generator to the Nimbus version of the mc-app (change O) or default 3.5.1; add `npm run check:nimbus-surface`.
      **Done when:** script rewrites the file idempotently; check exits non-zero on a forced version mismatch.
      **Watch out:** the file is generated: SPDX header and "do not edit" banner.

- [ ] 5.2 Port nimbus-scope and its tests
      **Why:** spec "Scope lists derived, audited and compound-aware".
      **Where:** `prompt/nimbus-scope.ts`, `tests/composed-pages/nimbus-scope.spec.ts` from legacy files.
      **How:** copy, fix imports (tool from `../tool`), keep all four tests (audit, compound markers, PageContent, no bare compound in examples).
      **Done when:** `npx jest tests/composed-pages/nimbus-scope.spec.ts` green.
      **Watch out:** the test scans the tool description too, so the tool must import the same constants.

- [ ] 5.3 Prompt with conditional Nimbus section
      **Why:** spec "Prompt contents".
      **Where:** `prompt/commercetools-ui.prompt.ts`.
      **How:** port; reference tool names via constants; include the "Look up the Nimbus API" section only when H's context says the Nimbus tools exist; keep the in-scope list always.
      **Done when:** tests for the enabled and disabled scenarios.
      **Watch out:** the model must not be told about tools it does not have.

## 6. Cross-change coordination

- [ ] 6.1 Expose the manifest version for K
      **Why:** K's pin test.
      **Where:** `prompt/nimbus-surface.generated.ts` export `NIMBUS_VERSION`; tell K's owner the import path.
      **Done when:** `node -e` import prints the version.
      **Watch out:** do not rename the export.

- [ ] 6.2 Frontend notes
      **Why:** P/R/O must adopt the fixed check.
      **Where:** write the amendment text in `plans/questions-inbox/IJKLM-plan-amendments.md` (already drafted); no frontend edits here.
      **Done when:** P, R and O owners acknowledged (comment in their change PRs).
      **Watch out:** until adopted the frontends keep working (they re-transpile).

## 7. Verification

- [ ] 7.1 Automated: `npx jest tests/composed-pages` (contract.spec.ts, schema.spec.ts, validate.spec.ts, transpile.spec.ts, tool.spec.ts, tool-source.spec.ts, fixture.spec.ts, nimbus-scope.spec.ts, prompt.spec.ts); `npm run check:nimbus-surface`; `npm run build`; `npm run lint`.
- [ ] 7.2 Chrome DevTools scenarios (run by V): E2E-M-01 ask for a dashboard, a `ui://composed-page/.../v1` part renders; E2E-M-02 ask to change the page, uri ends `/v2`; E2E-M-03 page with hooks renders using the server transpiled code (console shows no client re-transpile once P adopts the fix); E2E-M-04 ask for a page that uses `window`, assistant retries without it; E2E-M-05 save page, Custom Object appears in container `shared-composed-pages`; E2E-M-06 custom view session has no composed-page tool.
- [ ] 7.3 Docs to update (change W): composed pages contract (fixture, container key, encoding), how to regenerate the Nimbus surface, validation limits and the defence-in-depth note.
