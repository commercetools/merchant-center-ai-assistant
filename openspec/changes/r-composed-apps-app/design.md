## Context

Change R (`r-composed-apps-app`), needs O and M. Single-tenant port of the `composed-apps` Custom Application. Read `plans/00-overview.md`, `plans/02-target-architecture.md` and `plans/03-spec-dependency-map.md` first. Paths below: `L/` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/`.

## Explore findings

Facts verified by reading code on 2026-10-08 (no implementation run).

1. **App shape.** `L/composed-apps/src/routes.tsx` (67 lines): `NimbusProvider` (loadFonts off, router bridged to react-router v5 history) > `AllProviders` > `Switch` with `/:pageKey` -> `ComposedPageView` and a default route -> `ComposedPagesList`. Entry point `components/entry-point/entry-point.tsx` lazy-loads routes inside `ApplicationShell`.
2. **Auth context never blocks.** `L/composed-apps/src/context/index.tsx` comment: composed pages "must render whether or not the project has a Managed MCP Server"; `AuthProvider` always renders children. **After the BigQuery hook was removed, `useAuth()` has zero consumers** (`grep -rn useAuth` shows only `context/auth.tsx` and `context/index.tsx`). `AuthProvider` still POSTs `/auth/session` through `forwardToFetch` (`hooks/use-mc-session/index.ts`) purely to register the project in the multitenant router, which no longer exists. Console-logs the failure (`context/auth.tsx:68`).
3. **BigQuery remnant.** `L/composed-apps/src/context/data-sources-context.tsx` header still says "GraphQL and BigQuery"; `fetchDataSource` (lines ~150-165) and `refetchWithVariables` (~330) special-case `target === 'BIG_QUERY'` and return an error "pages no longer support". The type `TDataSource.target` is already the single-member union `'COMMERCETOOLS_PLATFORM'` (`types/composed-page.ts:33`). `mc-app/src/contexts/data-sources-context.tsx` carries the same remnant (mc-app owns its own cleanup in P/Q).
4. **Data fetching.** `hooks/use-graphql/index.ts` posts to `MC_API_PROXY_TARGETS.COMMERCETOOLS_PLATFORM` `/{projectKey}/graphql`. Storage hook `hooks/use-composed-pages-storage/use-composed-pages-storage.ts` (459 lines, byte-identical to mc-app's) uses `useMcQuery`/`useMcMutation` with four documents in `hooks/use-composed-pages-connector/*.ctp.graphql`. **The list query is hard-coded `limit: 100, offset: 0`** (line ~179): a project with more than 100 pages silently shows 100. Requirement "Pagination beyond one request" fixes this.
5. **Scopes.** `custom-application-config.mjs` requests 19 `view_*` and 18 `manage_*` scopes (stores, tax categories, products, product selections, categories, standalone prices, cart discounts, discount codes (view only), customers, customer groups, business units, orders, payment methods, shopping lists, shipping methods, quote requests, staged quotes, quotes, key-value documents). The comment explains they back arbitrary GraphQL stored in the pages. The assistant prompt `service/src/functional-agent/agents/prompts/commercetools-ui.prompt.ts:282` lets generated pages issue `{ type: 'mutation', mutation: 'graphql...' }` UI actions, so `manage_*` cannot be dropped without breaking generated mutations.
6. **CSP.** Same file: `script-src` lists `*.ngrok-free.app`, `localhost:8080`, three `*.run.app` regions plus `'unsafe-inline'` and `'unsafe-eval'`; the comment itself says the browser never contacts the router directly. `'unsafe-eval'` is required by `new Function(...)` in `utils/babel-renderer.tsx`.
7. **Renderer chain** (shared with mc-app; line deltas vs mc-app copy measured with `diff`): `utils/babel-renderer.tsx` 1308 lines (204 differing lines, formatting + Nimbus import shape; header falsely claims "byte-identical"), `components/page-renderer/index.tsx` 277 (62), `components/ui-error-boundary/index.tsx` 341 (221), `components/composed-page-chart/index.tsx` 245 (83), `types/composed-page.ts` 261 (8), `types/chart.ts` identical, `utils/schema-helpers.ts` identical, storage hook identical. `babel-renderer.tsx` contains 6 `console.*` calls (lines 188, 942, 1027, 1123, 1139) and `page-renderer` has two (180, 184, 249).
8. **Legacy schema.** `components/page-renderer/index.tsx:256-277` renders v5 via `isPageSchemaV5`, otherwise `LegacyFormatWarning` ("Legacy Page Format (version)").
9. **Hygiene.** `L/composed-apps/public/` contains compiled bundles (`app.*.js`, `stats.json`, `google977a....html`) - build output committed; `.env` present with placeholder values; starter leftovers `helpers.ts`, `types.ts`, `test-utils/index.tsx`, `types/generated/ctp.ts` (12,532 lines, generated); `extract-intl`/`intl-formatter.js`; `test` script is `echo 'No tests'`; `@commercetools-frontend/*` pinned at 25.1.0, react-intl ^7.1.4, react 19.0.0, react-router-dom 5.3.4 (`package.json`).
10. **Config.** `.env.example` keys: `APPLICATION_URL`, `INITIAL_PROJECT_KEY`, `CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH=ai-assistant-pages`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`. The config reads `additionalEnv.chatServiceEndpointUrl` only for the bootstrap that this change removes.
11. **Connect rules** (`commercetools-connect` skill, `references/merchant-center-customizations.md`): `${env:...}` placeholders for `applicationId`, `url`, `entryPointUriPath`; request only the scopes the UI uses; test a permission-denied path; `NODE` build runs inside the app folder (no workspace). The skill's `project-structure.md` prefers a `shared/` folder, but the Merchant Center webpack config only transpiles `sourceFolders` (`node_modules/@commercetools-frontend/mc-scripts/dist/create-webpack-config-for-production-*.esm.js:370,400,481 include: mergedOptions.sourceFolders`), so a sibling `shared/` folder is not compiled without custom webpack - this is why the plan duplicates and guards (see D4).

## Glossary

- **Composed page**: a UI page generated by the assistant, stored as a Custom Object value `{name, icon, schema, isPublished, createdBy}`; schema v5.0 holds `components[]`, each with JSX source, imports and data sources.
- **Custom Object container**: namespace for Custom Objects; here the composed-pages container (change M fixes the name, default `shared-composed-pages`).
- **Data source**: a GraphQL query plus variables bound to a component; fetched lazily per component by `ComponentDataWrapper`.
- **Babel renderer**: runtime that transpiles JSX with `@babel/standalone` and executes it via `new Function` with an injected scope.
- **Merchant Center proxy (`/proxy/ctp`)**: Merchant Center API gateway used by `useMcQuery` to call commercetools with the user's token.
- **forward-to**: the gateway that forwards browser calls to the AI service with a signed JWT; NOT used by this app after this change.
- **Entry point URI path**: the URL segment of a Custom Application inside a project.

## Source map

| Legacy file (under `L/composed-apps/`) | New file (`composed-apps/`) | Verdict |
|---|---|---|
| `custom-application-config.mjs` | same | CHANGE (scrub CSP, drop `additionalEnv`, justify scopes) |
| `package.json`, `tsconfig.json`, `.eslintrc.js`, `.prettierrc`, `.nvmrc`, jest configs | same | CHANGE (versions from O; real `test` script) |
| `src/index.tsx`, `components/entry-point/*`, `load-messages.ts` | same | KEEP (drop `console.warn`) |
| `src/routes.tsx` | same | KEEP |
| `src/constants.ts` | same | CHANGE (container key imported from M's contract value) |
| `src/context/auth.tsx`, `hooks/use-mc-session`, `hooks/use-chat-service-endpoint`, `utils/forward-to.ts` | - | DROP (D2) |
| `src/context/index.tsx` | same | CHANGE (`AllProviders` = `ComposedPagesProvider`) |
| `src/context/composed-pages-context.tsx`, `composed-page-context.tsx` | same | KEEP |
| `src/context/data-sources-context.tsx` | same | CHANGE (no BigQuery; unsupported-target error; export `resolveVariables`) |
| `src/hooks/use-graphql`, `use-composed-pages-storage`, `use-composed-pages-connector/*.graphql` | same | KEEP (paginate list) |
| `src/components/composed-pages-list`, `composed-page-view`, `page-renderer`, `ui-error-boundary`, `composed-page-chart` | same | KEEP (remove `console.*`) |
| `src/utils/babel-renderer.tsx`, `schema-helpers.ts` | same | KEEP (drift-guarded) |
| `src/types/composed-page.ts`, `chart.ts` | same | KEEP |
| `src/types/generated/ctp.ts`, `helpers.ts`, `types.ts`, `test-utils/*`, `graphql.d.ts` (keep only if graphql loader needs it) | - | DROP |
| `public/*` (build output), `.env`, `yarn.lock` (regenerate), `intl-formatter.js`, `extract-intl` script | - | DROP |
| `src/i18n/data/{en,de}.json` (empty) | `en.json` only | CHANGE |
| `README.md` (starter) | new per-app README | CHANGE |

## Decisions

**D1. Keep the app a pure Merchant Center GraphQL client.** Alternatives: (a) route data through the service - rejected: adds an availability dependency and needs a new endpoint; (b) keep GraphQL via `useMcQuery` - chosen; matches legacy and the user's own permissions bound what a page can read.

**D2. Remove the `/auth/session` bootstrap, `AuthProvider`, `forward-to` and `CHAT_SERVICE_ENDPOINT_URL` from `composed-apps`.** Alternatives: (a) keep a never-blocking `AuthProvider` for parity with spec O - rejected: zero consumers, it only fires a request that can fail and logs to console, and with single-tenant there is no project registration to perform; (b) keep it behind "if URL set" - rejected as dead code. Consequence: `composed-apps` is no longer a client of the service, `connect.yaml` for this app needs no `CHAT_SERVICE_ENDPOINT_URL` (plan 02 lists it "optional"; see plan amendments) and `forward-to.ts` has two copies (mc-app, mc-view-app). If O's drift check or contracts assume a third copy, O changes, not R. The app has no admin-only surface: it never reads `isAdmin`, never calls the service and never sends or reads an e-mail (`userEmail`, `userLabel`); who may open it is decided only by the Merchant Center View/Manage permission of the Custom Application, and what a page may read by the user's own MC permissions. If the owner later wants admin-aware UI (bootstrap `isAdmin` from the service), re-add a bootstrap in a new change.

**D3. BigQuery removal.** The unsupported-target guard is generic ("Unsupported data source target `X`") rather than naming BigQuery, so no BigQuery vocabulary remains. Variable-less refetch path is deleted.

**D4. Duplication with mc-app.** Alternatives: (a) shared package folder - rejected: mc-scripts only transpiles `sourceFolders`, no npm workspaces allowed, Connect builds each folder independently; (b) publish an internal npm package - rejected: adds a release process to an open-source labs repo; (c) copy + drift guard - chosen. Canonical copy = whichever lives in `mc-app` after P/Q (implemented earlier in wave 6); R copies from it, not from the legacy composed-apps copy, then runs `check-duplicates`. Registered groups: `composed-renderer` (`utils/babel-renderer.tsx`, `components/page-renderer/index.tsx`, `components/ui-error-boundary/index.tsx`, `components/composed-page-chart/index.tsx`), `composed-types` (`types/composed-page.ts`, `types/chart.ts`), `composed-storage` (`hooks/use-composed-pages-storage/*`, `use-composed-pages-connector/*.graphql`, `utils/schema-helpers.ts`). The drift check compares normalised content (prettier-formatted) so formatting-only drift does not fail. The skill's "shared code in `shared/`, not duplicated" checklist item is answered in the README: Merchant Center apps cannot import outside `src`.

**D5. Scopes.** Keep the legacy `view_*`/`manage_*` set (needed by generated mutations) but (a) document each scope in the README, (b) add `manage_discount_codes` ONLY if owner confirms (view-only today; flagged as RQ4 - a page editing a discount code currently fails). The admin model (`ADMIN_USER_IDS`, service-decided) does not touch this app, so no `view_mcp_servers`/`manage_mcp_servers` scope is added here (no Managed MCP surface). Alternative: ship read-only (`view_*` + `manage_key_value_documents`) - safer; offered to the owner as RQ4 default = keep legacy set to preserve behaviour.

**D6. Pagination.** Replace the single `limit:100` fetch with a loop (limit 100, increasing offset until `total` reached, bounded at the Custom Object offset cap of 10,000, verified in change E) - or `sort`+`limit` with a "load more" button if the list exceeds 500. Chosen: loop to 500 pages and show a notice above that; simplest and covers realistic use.

**D7. Tests.** Introduce jest (`jest.test.config.js` already exists) for pure logic: `resolveVariables`, `cleanQuery`, unsupported-target, `parseComposedPage` (string and object value, missing fields), `isPageSchemaV5`, pagination loop. Component tests are not added (Chrome scenarios cover them).

## Risks / Trade-offs

- **Renderer executes generated code in the app origin** (no sandbox) with the user's session. Accepted legacy behaviour; documented in README "Security model"; CSP `unsafe-eval` unavoidable.
- **Copy drift** between mc-app and composed-apps - mitigated by the guard; the guard is only as good as O's implementation.
- **Scope breadth** - the app token carries many manage scopes; mitigated by per-user permissions and documentation, offered as RQ4.
- **mc-app copy not yet written when R is planned** - R's tasks say "locate the file in `mc-app/` as created by P/Q; if its path differs, adapt".
- **Nimbus/Chakra typegen** (`postinstall: chakra typegen`) is required for typecheck; keep it, CI-less, run in setup.
- **Hidden dependence on 27.9.6 behaviours** (jump from 25.1.0): `ApplicationShell` props, `useMcQuery` types may change; first task pins and typechecks before anything else.

## Open questions

- **RQ4** (owner): keep legacy manage scope set or ship read-only pages? Default keep (see D5). Mirrored in `plans/questions-inbox/RSTVWZ-questions.md`.
- **RQ5** (owner): should the page list offer delete/publish toggles here (mc-app has delete)? Default no.
- Confirm in implementation: the exact composed-pages container constant from change M and whether `createdBy` stores an e-mail (PII) - if so the list must not display it (the legacy list does not).

## Changelog

- 2026-10-09 (owner decision Q9): no change to behaviour. Composed apps still make no service calls, so they never load backend-streamed (`/files/...`) assistant images; pages that show images use external URLs only. The `useServiceImage` blob-URL loader of change P is intentionally not copied here.
- 2026-10-09: Owner decision on admin model (`ADMIN_USER_IDS`, service-decided, no permission groups): no behaviour change for `composed-apps`; it stays free of any service dependency, reads no `isAdmin`, sends no e-mail, and gets no MCP scopes. E2E-R-04 now uses the non-admin user temporarily without the app's View permission instead of a separate view-only Team.
