# Change M (m-composed-pages): implementation notes

## Summary

Branch `worktree-agent-ac8177f8390d03b33` (equal to `develop` tip `b6566e1`, changes A-H, K, N, O, P, S, U, before starting). Tasks 0.1-5.3, 6.1 and 7.1 are done and ticked. Not ticked: 6.2 (needs P/R/O owners to acknowledge; no frontend edit was made, as the task says), 7.2 (Chrome E2E, needs a deployed service and credentials), 7.3 (docs belong to change W).

Built in `service/src/composed-pages/`:
- `contract.ts` (schema version `5.0`, `COMPOSED_PAGES_CONTAINER_KEY`, URI build/parse, base64 encode/decode, `isSupportedSchema`, `isUsableTranspiledCode` via `@babel/parser`, the shared types incl. `TPageSchemaV5`, `TRenderData`, `TUIAction`, stored value). Imports only `@babel/parser` (a test scans all imports of the module graph).
- `schema.ts` (zod input schema with caps 20/10/20,000, optional `key`, `previousVersion`, `{path,message}[]` wrapper, `DATA_SOURCE_TARGETS` tuple), `validate.ts` (AST validator with `@babel/traverse`, GraphQL read-only check with `graphql`), `transpile.ts` (lazy Babel, classic runtime, 10 s race), `tool.ts` (`createComposedPage` core + AI SDK `composedPageTool`), `tool-source.ts` (order 60), `constants.ts`, `fixture.ts`.
- `prompt/`: `commercetools-ui.prompt.ts` (ported, Nimbus lookup section conditional), `nimbus-scope.ts` (ported, SPDX), `nimbus-surface.generated.ts` (byte copy of mc-app's manifest, Nimbus 3.6.0, exports `NIMBUS_VERSION`).
- `service/scripts/generate-nimbus-surface.mjs` (+ `generate:nimbus-surface`, `check:nimbus-surface`, `update:composed-page-fixture` npm scripts), `service/scripts/update-composed-page-fixture.mjs`, `contract/composed-page.fixture.json` (repo root).
- Shared wiring: `tool-sources/index.ts` gets one import and one `registerToolSource(composedPageSource)` line.
- Tests `service/tests/composed-pages/` (9 files, 65+ tests): contract, schema, validate, transpile, tool, tool-source, fixture, nimbus-scope (ported, all four tests), prompt (also the surface check exit code).

Dependencies (exact): `@babel/core 7.29.7`, `@babel/preset-react 7.29.7`, `@babel/parser 7.29.9`, `@babel/traverse 7.29.10`, `graphql 17.0.2` (runtime); `@types/babel__core`, `@types/babel__traverse` (dev). Babel 7 on purpose: `npm install` first resolved Babel 8 (ESM-only, different defaults); the design measured Babel 7 (legacy used `^7.28`).

Commands run (this worktree):
- `cd scripts && npm ci` ok. `cd service && npm ci && npm run build && npm test && npm run lint` -> build ok; 128 suites / 1089 tests pass (K baseline 119 / 1019); lint 0 errors, 21 warnings (all old legacy-port tests). `npm run check:foundation` ok; `npm run check:nimbus-surface` ok (exits 1 on a forced mismatch, tested); `node scripts/smoke-start.mjs` -> smoke OK; `node -e "require('@babel/core')"` ok and `require.cache` has no `@babel/core` after loading the service entry (lazy).
- Root: `node scripts/check-connect-layout.mjs`, `spdx-check.mjs`, `check-repo-rules.mjs`, `check-duplicates.mjs` all ok; `openspec validate m-composed-pages --strict` valid; no `console.` in `composed-pages/`.

## Questions (for the owner)

1. OQ-M1 still open: keep container key `shared-composed-pages` (done, single constant) or rename.
2. Source name: spec/design say `commercetools-ui`, H's agent key and startup report say `commercetoolsUI`. I used `commercetoolsUI` (see Deviations). Confirm.
3. Should frontends P/R adopt the contract check now? The code paths are still the old regex (see TODOs). Needs owner assignment.

## Missed features / gaps found in the spec

- No `ctx.hasTool(name)` exists in H's `ToolContext`, and `ToolSource.getPrompt` is synchronous and runs after tools resolve only through the registry. Task 0.2 says to ask H's owner. Instead I read `ctx.config.nimbus.enabled` (the same kill switch K reads), which is wrong only when Nimbus is enabled but the child failed to start in this turn: the prompt then mentions tools that are not there. Suggested H amendment: let `registry.resolve` pass the already merged tool names to `getPrompt` (or add `ctx.hasTool`).
- The spec says the validator must reject "a function/arrow declaration of the component". I reject a top-level `function <ComponentName>` declaration, and every body without a top-level `return` (which catches an arrow-component wrapper). A body wrapped as `const X = () => {...}; return X;`-style tricks is accepted (harmless).
- `isUsableTranspiledCode` ("start with `function`, end with name") also requires the function name equal the component name; the spec only says "last statement is the identifier".
- Babel `transformAsync` runs largely synchronously on the event loop, so the 10 s `Promise.race` cannot interrupt a CPU-bound transform; it only guards against a hang. The 20,000 character cap bounds the cost. A hard limit would need a worker thread.
- The "no import, export" rule depends on the parser error text of Babel for `import`/`export` inside a function (matched with `/\b(import|export)\b/`); a syntax error whose message merely contains the word `import` gets the friendly import message.
- Legacy required "React import" in `imports` and a body starting with specific tokens; both dropped (spec lists neither; imports are declarative). `imports` is now optional on input and always an array in the output.
- Spec scenario "Cold start not paid at boot" says "module-loaded check in test"; under ESM Jest there is no `require.cache`, so the test uses an exported `isBabelLoaded()` flag (verified separately with `require.cache` in plain Node, see Summary).
- `graphql` 17 (latest) accepted; spec said only "graphql".
- The tool description example uses the legacy `"componentBody"` JSON strings; they are scanned by the ported audit test (no bare compound tag).
- The surface manifest generator cannot run in `service/` (Nimbus is not a service dependency: React, Chakra). The task says to copy the legacy script and point it at the mc-app version; O already ships that generator in mc-app (with `--out`). So the service script delegates: default copies mc-app's committed manifest, `--regenerate` runs mc-app's generator first, `--check` compares version and bytes. The manifest header therefore says "Produced by mc-app/scripts/generate-nimbus-surface.mjs".
- K's `nimbus-pin.spec.ts` first looks for M's `service/src/agents/prompts/nimbus-surface.generated.ts` (path named in K's task 7.1); M's path is `service/src/composed-pages/prompt/nimbus-surface.generated.ts` (path fixed by M's tasks). K's test falls back to mc-app's copy, which is identical, so it keeps passing; K's owner should point it to `composed-pages/prompt/` (task 6.1: "tell K's owner the import path").
- The tool's input JSON schema is passed with `jsonSchema(z.toJSONSchema(...))` rather than the zod schema, so the AI SDK does not throw on invalid input and the spec requirement "errors returned as results" holds. Side effect: the SDK no longer parses/validates for us (we do, in `execute`), and default values would not be applied (there are none).
- The spec scenario "contract test compares the constant with the values in the fixture used by P and R": P/R do not read the fixture yet, so only the service side is tested.

## TODOs (skipped or unverifiable here)

- Frontend adoption (PA-M1, PA-M2), NOT done because tasks 6.2 says "no frontend edits here": replace `hasReturnStatement` in `mc-app/src/utils/babel-renderer.tsx` (line ~346 and the call at ~899, plus the wrapper copy at ~369) by a parser check equal to `isUsableTranspiledCode`; import/derive `SHARED_COMPOSED_PAGES_CONTAINER_KEY` from the shared contract instead of the literals in `mc-app/src/constants.ts` and `composed-apps/src/constants.ts`; validate mc-app's `TPageSchemaV5` types against `contract/composed-page.fixture.json`. No frontend file was touched by M, so the byte-identical-copy rules and mc-app's yarn checks were not affected (not re-run). Until adopted the browser re-transpiles hooks components, as in legacy.
- Also stale in mc-app: the header comment of `mc-app/src/types/composed-page.ts` says "Current version: 4.0".
- 6.2 acknowledgement of P/R/O owners; 7.2 E2E-M-01..06 (Chrome, deployed service, model credentials); 7.3 docs (change W).
- Not run: `commercetools connect validate` and a real model call (no Docker, no credentials).
- `plans/questions-inbox/IJKLM-plan-amendments.md` was only read (PA-M1..M4); PA-M3 (Nimbus version in three places) is checked by `check:nimbus-surface` (M vs mc-app) and K's pin test (K vs manifest).
- Per-request Babel memory (about 90 MB) with K's child (about 96 MB cap) was not measured in the Connect image.

## Deviations from the spec (with reason)

- Source name `commercetoolsUI` instead of `commercetools-ui`: H's `AGENT_KEYS`, `logGatedAgentKeys`, `disabledTools` keys and H's notes all use `commercetoolsUI`; a different name would report the key as "without a source" at startup. The tool name `create_composed_page` is unchanged.
- Existing tests edited minimally (as K did for its source): `tests/chat/orchestrator.spec.ts` and `tests/wire/builtin-sources.spec.ts` now expect `create_composed_page` / the `commercetoolsUI` contributor in the "built-ins" set.
- Prompt gating through `ctx.config.nimbus.enabled` (see gaps) instead of a tool-presence check.
- Success output carries `success: true` next to `uri` and `schema` (the spec lists it: `{ success:true, uri, schema }`; the legacy output had no flag). The fixture contains it, so frontends must tolerate the extra field.
- Surface generator delegates to mc-app (see gaps).
- Test hooks `resetBabelForTests` / `setTransformForTests` in `transpile.ts` (ESM Jest cannot inspect `require.cache`, and a real CPU-bound transform cannot be timed out).
- Dynamic `import(variable)` for `@babel/preset-react` (it ships no type declarations and adding an ambient `.d.ts` is not picked up by ts-jest's inline tsconfig); still lazy, still loaded only on first use.
- Branch: stayed on the harness worktree branch instead of `spec/m`.
