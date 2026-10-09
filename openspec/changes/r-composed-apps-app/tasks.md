## 0. Read first

- [ ] 0.1 Read `proposal.md`, `design.md` (Explore findings, Decisions D1-D7) and `specs/composed-apps-app/spec.md` in this folder.
- [ ] 0.2 Read `plans/00-overview.md` (requirements R1-R10), `plans/02-target-architecture.md` (layout rules) and `plans/04-workflow.md` section 3-5.
- [ ] 0.3 Read the outputs of changes O (foundation: pinned versions, scripts, `scripts/check-duplicates.mjs`, env contract) and M (composed-page schema v5.0 and container name) under `openspec/specs/` or `openspec/changes/archive/`.
- [ ] 0.4 Skim the legacy files: `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps/src/routes.tsx`, `custom-application-config.mjs`, `src/context/data-sources-context.tsx`, `src/utils/babel-renderer.tsx` (just the header, `IMPORT_MAP` and `ComponentDataWrapper`).
- [ ] 0.5 Read https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-application-config.md (placeholders, `oAuthScopes`, `headers.csp`).

You should now be able to explain: (a) what a composed page is and where it is stored, (b) why this app needs `'unsafe-eval'`, (c) why it no longer talks to the AI service, (d) why some files are duplicated in `mc-app` and how that is guarded.

## 1. Setup

- [ ] 1.1 Create a branch and verify prerequisites.
  **Why:** work in isolation, fail early on missing foundation.
  **Where:** repo root `/Users/behnam/code/commercetools-labs/ai-assistant`.
  **How:** 1. `git switch -c spec/r-composed-apps-app`. 2. `node -v` must print `v22.x`. 3. `ls scripts/check-duplicates.mjs scripts/spdx-check.mjs` must list both (from changes A/O). 4. `ls mc-app/src/utils/babel-renderer.tsx` (or the path chosen by P/Q) must exist.
  **Done when:** all four commands succeed; otherwise stop - a "Needs" change is not implemented.
  **Watch out:** never `cd` into or edit the legacy repo; copy with `cp`.

## 2. Scaffold the folder

- [ ] 2.1 Copy tooling files and set package identity.
  **Why:** same toolchain as the other two apps (decision D7 in plan 00).
  **Where:** create `composed-apps/{package.json,tsconfig.json,.eslintrc.js,.prettierrc,.prettierignore,.nvmrc,.gitignore,jest.test.config.js,jest-runner-eslint.config.js,jest.eslint.config.js,jest.d.ts}`; copy from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps/`, then align with `mc-app/` versions.
  **How:** 1. `mkdir composed-apps && cd composed-apps`. 2. Copy files listed (not `node_modules`, `public`, `.env`, `yarn.lock`). 3. In `package.json` set `"name": "@commercetools-labs/ai-assistant-composed-apps"`, `"private": true`, `"license": "MIT"`, `"version": "0.1.0"`. 4. Replace every `@commercetools-frontend/*` `25.1.0` with the version pinned by change O (27.9.6). 5. Remove scripts `extract-intl`, `versions:appkit`; set `"test": "jest --config jest.test.config.js"`. 6. Remove dev deps no longer used (`@composable-commerce-test-data`, unused testing libs) only after step 3 of task 7.3 passes.
  **Done when:** `yarn install` finishes without errors and `yarn nimbus:typegen` (postinstall) prints no error.
  **Watch out:** Yarn 1 project; do not create a root `package.json` or workspaces. Keep the `postinstall` Nimbus typegen or `tsc` fails on Chakra types.

- [ ] 2.2 Add `.env.example` and the SPDX headers.
  **Why:** `.env` files with real IDs were committed in the legacy repo.
  **Where:** `composed-apps/.env.example` (copy from legacy `.env.example`).
  **How:** keep keys `APPLICATION_URL`, `INITIAL_PROJECT_KEY`, `CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH=ai-assistant-pages`, `CLOUD_IDENTIFIER=gcp-us`; DELETE `CHAT_SERVICE_ENDPOINT_URL` (decision D2); use obviously fake values (`https://example.invalid`, `your-project-key`). Confirm `.gitignore` ignores `.env`, `public/`, `dist/`, `node_modules/`.
  **Done when:** `git check-ignore composed-apps/.env composed-apps/public/x` prints both paths.
  **Watch out:** never copy the legacy `.env` or `public/` folder.

## 3. Application configuration

- [ ] 3.1 Write `custom-application-config.mjs` and `src/constants.ts`.
  **Why:** the config file is the contract with Merchant Center and Connect (spec requirements "Custom Application identity", "Least-privilege", "CSP").
  **Where:** `composed-apps/custom-application-config.mjs`, `composed-apps/src/constants.ts`; copy from legacy files of the same name.
  **How:** 1. Keep `name`, `entryPointUriPath`, `cloudIdentifier`, `env.production.{applicationId,url}`, `env.development.initialProjectKey`, `icon`, `mainMenuLink`. 2. Delete `additionalEnv`. 3. CSP: `connect-src: ['*.commercetools.app','*.gstatic.com']`; `script-src: ['*.commercetools.app','*.gstatic.com',"'unsafe-inline'","'unsafe-eval'"]`; keep `img-src`,`font-src`,`style-src` `*.gstatic.com`. 4. Keep `oAuthScopes` exactly as legacy unless owner answered RQ4 otherwise; add a comment per group (what GraphQL needs it). 5. In `constants.ts` import the container key constant from the location specified by change M (default string `'shared-composed-pages'`), keep `PERMISSIONS`.
  **Done when:** `grep -nE "ngrok|run\.app|localhost|multiplatform" composed-apps/custom-application-config.mjs` prints nothing.
  **Watch out:** `${env:ENTRY_POINT_URI_PATH}` is substituted only inside the config file; `constants.ts` reads `process.env`/`window.app` (keep the existing dual-runtime comment).

- [ ] 3.2 Entry point, shell and messages.
  **Why:** app boots inside `ApplicationShell`.
  **Where:** `src/index.tsx`, `src/components/entry-point/{entry-point.tsx,index.ts}`, `src/load-messages.ts`, `src/i18n/data/en.json` (`{}`); legacy copies under `.../composed-apps/src/`.
  **How:** copy; in `load-messages.ts` replace `console.warn` by returning `{}` silently (or the loggers package if O mandates one for frontends); drop `de.json`.
  **Done when:** `yarn typecheck` passes for these files (other files may still be missing - use task 7 for a full pass).
  **Watch out:** `enableReactStrictMode` is on; effects run twice in dev.

## 4. Data layer

- [ ] 4.1 Copy types, schema helpers, storage hook and GraphQL documents.
  **Why:** these files are shared with mc-app (decision D4).
  **Where:** `src/types/composed-page.ts`, `src/types/chart.ts`, `src/utils/schema-helpers.ts`, `src/hooks/use-composed-pages-storage/{index.ts,use-composed-pages-storage.ts}`, `src/hooks/use-composed-pages-connector/*.ctp.graphql`, `src/hooks/use-graphql/index.ts`, `src/graphql.d.ts`. Source: the `mc-app/src/...` copies written by P/Q; fallback legacy `.../composed-apps/src/...`.
  **How:** copy; remove `console.error` lines in the storage hook (return the minimal page object silently or via logger); keep `SHARED_COMPOSED_PAGES_CONTAINER_KEY` import from `constants`.
  **Done when:** `diff -q mc-app/src/types/chart.ts composed-apps/src/types/chart.ts` prints nothing.
  **Watch out:** `useMcQuery` returns the custom object `value` already parsed - the hook handles string and object (keep both branches, tested in 8.1).

- [ ] 4.2 Paginate the list query.
  **Why:** legacy fetches only `limit:100, offset:0` (design finding 4).
  **Where:** `src/hooks/use-composed-pages-storage/use-composed-pages-storage.ts` (function that builds the pages query, around line 179) and a pure helper `src/hooks/use-composed-pages-storage/paginate.ts`.
  **How:** 1. Write `fetchAllPages(fetchPage, total)` helper: loop while `loaded < total` and `offset <= 500`. 2. Use Apollo `fetchMore` or sequential `refetch` with new offset (check the hook's current structure first). 3. Expose `truncated: boolean` when `total > 500`. 4. The list shows an info alert when truncated. 5. Mirror the change in `mc-app`'s copy (same file) so the drift guard stays green - or raise it in the PR if P/Q owners disagree.
  **Done when:** unit test `paginate.spec.ts` (task 8.1) green.
  **Watch out:** Custom Object `offset` max is 10,000 (see change E findings); sort by `createdAt` for stable paging.

- [ ] 4.3 Rewrite `data-sources-context.tsx` without BigQuery.
  **Why:** spec "GraphQL data sources only".
  **Where:** `src/context/data-sources-context.tsx`; legacy `.../composed-apps/src/context/data-sources-context.tsx`.
  **How:** 1. Copy. 2. Update the header comment ("GraphQL data fetching for composed pages"). 3. Add `const SUPPORTED_TARGET = 'COMMERCETOOLS_PLATFORM'`; helper `unsupportedTarget(ds)` returns `Error('Unsupported data source target "X" in data source "id". Ask the assistant to rebuild this page.')` when `ds.target` is defined and not equal. 4. Remove both `'BIG_QUERY'` branches (in `fetchDataSource` and `refetchWithVariables`); call the helper at the top of each. 5. `export` `resolveVariables` and `cleanQuery` for tests. 6. Replace `console.warn` for a missing data source by returning silently. 7. Keep polling, mounted ref, `fromUrl`, type conversions as is.
  **Done when:** `grep -rniE "big_?query|warehouse|sql" composed-apps/src` returns nothing except `spec` fixtures.
  **Watch out:** `resolveVariables` converts `undefined` to `'undefined'` for `type: 'string'`? It guards `value !== undefined` first - keep that guard; add a test.

- [ ] 4.4 Contexts without auth.
  **Why:** decision D2.
  **Where:** `src/context/index.tsx`, `composed-pages-context.tsx`, `composed-page-context.tsx`.
  **How:** `AllProviders = ({children}) => <ComposedPagesProvider>{children}</ComposedPagesProvider>`. Do NOT copy `auth.tsx`, `use-mc-session`, `use-chat-service-endpoint`, `utils/forward-to.ts`. Keep the explanatory comment shortened ("renders whether or not the AI service exists").
  **Done when:** `grep -rn "forward-to\|useAuth\|chatService" composed-apps/src` prints nothing.
  **Watch out:** `data-sources-context` takes `userId` from `context` prop - find who supplies it (`babel-renderer` `ComponentDataWrapper`) and source it from `useApplicationContext(c => c.user?.id)` instead of the removed auth context.

## 5. UI

- [ ] 5.1 Routes, list, view.
  **Why:** the user-visible pages.
  **Where:** `src/routes.tsx`, `src/components/composed-pages-list/index.tsx`, `src/components/composed-page-view/{composed-page-view.tsx,index.ts}`; drop `messages.ts` (unused).
  **How:** copy; update list empty text to "No composed pages yet. Ask the AI Assistant to create one."; show truncated notice; remove `console.error` in `composed-page-view`; make the "not found" and "legacy format" states match the spec wording exactly.
  **Done when:** `yarn typecheck` passes.
  **Watch out:** `history.push(`${match.url}/${row.key}`)` - keys may contain characters needing `encodeURIComponent`; Custom Object keys are `[-_~.a-zA-Z0-9]` so safe, but add a test comment.

- [ ] 5.2 Renderer chain.
  **Why:** the heart of the app.
  **Where:** `src/utils/babel-renderer.tsx`, `src/components/page-renderer/index.tsx`, `src/components/ui-error-boundary/index.tsx`, `src/components/composed-page-chart/index.tsx` - copy from the `mc-app` copies written by P/Q.
  **How:** 1. Copy. 2. Confirm `console.*` are removed in the mc-app copy (spec P/Q); if not, remove them in BOTH copies (10 occurrences: babel-renderer lines ~188, 942, 1027, 1123, 1139; page-renderer ~180, 184, 249; error-boundary ~234). 3. Fix the false "byte-identical" header comment. 4. Confirm no import of `use-bigquery` or auth context.
  **Done when:** `node scripts/check-duplicates.mjs` exits 0 for the group `composed-renderer` (after task 6.1).
  **Watch out:** Executing generated code: do not "improve" the scope without changing M's schema contract.

## 6. Drift guard and docs

- [ ] 6.1 Register shared files in `scripts/check-duplicates.mjs`.
  **Why:** spec requirement "Shared renderer code stays in step".
  **Where:** `scripts/check-duplicates.mjs` (created by O).
  **How:** add three groups from design D4 following O's existing config shape (read the script first). Comparison must be prettier-normalised.
  **Done when:** `node scripts/check-duplicates.mjs` exits 0; then change one character in `composed-apps/src/utils/schema-helpers.ts` and it exits non-zero naming both files; revert.
  **Watch out:** If O's script only supports byte-equality, run `yarn prettier --write` on both copies in the same commit.

- [ ] 6.2 Per-app README (Connect certification).
  **Why:** Connect requires a README per connector; change W links it.
  **Where:** `composed-apps/README.md` (replace starter text).
  **How:** sections: What it is; Prerequisites (register Custom Application, M6); Configuration table (`CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER`, `APPLICATION_URL` injected by Connect); Required scopes table (every `oAuthScopes` entry with justification); Permissions (the application's View/Manage pair only; this app has no admin-only surface and never calls the service); Security model (generated code runs in the app origin, `unsafe-eval`); Fail-open/closed (service down: pages still render; GraphQL failure: per-data-source error); Local development (`yarn start`, `.env`); Poison/replay: "not applicable - no events or jobs"; Unsupported-software notice (labs wording from change A, exactly).
  **Done when:** README has all sections; `grep -n "TODO" composed-apps/README.md` prints nothing.
  **Watch out:** no demo framing, no customer names.

## 7. Quality gates

- [ ] 7.1 Typecheck and lint.
  **Why:** Definition of Done.
  **Where:** `composed-apps/`.
  **How:** `yarn typecheck && yarn lint`.
  **Done when:** both exit 0 (fix errors; typical ones: removed imports, `any` in `use-graphql` - type the payload with `{data?: unknown; errors?: {message: string}[]}`).
  **Watch out:** the 25.1 -> 27.9 upgrade may rename exports; consult https://github.com/commercetools/merchant-center-application-kit/releases.

- [ ] 7.2 SPDX headers and hygiene scan.
  **Why:** labs rules (plan 00 R5).
  **Where:** every file under `composed-apps/src` and the config files.
  **How:** `node scripts/spdx-check.mjs --fix` if O/A offer it, otherwise add the header by hand: `// SPDX-License-Identifier: MIT` plus the copyright line used by A. Then `grep -rn "console\." composed-apps/src` must print nothing.
  **Done when:** `node scripts/spdx-check.mjs` exits 0.
  **Watch out:** `.graphql` files use `#` comments.

- [ ] 7.3 Build.
  **Why:** proves Connect can build it.
  **Where:** `composed-apps/`.
  **How:** `yarn build` (runs `mc-scripts build`); then `ls public` shows `index.html`; run `git status` to confirm `public/` is ignored.
  **Done when:** exit 0 and bundle contains no `ngrok` (`grep -rl ngrok public || echo clean`).
  **Watch out:** the build needs the env placeholders: `cp .env.example .env` locally (git-ignored) with fake values; `APPLICATION_URL` must be a URL.

## 8. Tests

- [ ] 8.1 Write unit tests.
  **Why:** the legacy app had none (`"test": "echo 'No tests'"`).
  **Where:** `src/context/data-sources-context.spec.ts`, `src/hooks/use-composed-pages-storage/parse.spec.ts` (export `parseComposedPage`), `paginate.spec.ts`, `src/types/composed-page.spec.ts`.
  **How:** cases - `resolveVariables`: literal, `fromContext` for each key, `fromUrl` `:orderId`, number/boolean/array/string conversion, undefined stays undefined; `unsupportedTarget`: `BIG_QUERY` -> error, `COMMERCETOOLS_PLATFORM` -> none, undefined -> none; `parseComposedPage`: string value, object value, missing name falls back to key, `isPublished` default true, invalid JSON returns minimal object; `paginate`: 250 total -> 3 requests, `total > 500` -> `truncated`; `isPageSchemaV5` true/false.
  **Done when:** `yarn test` prints `Tests: N passed` and exits 0.
  **Watch out:** jest config comes from `@commercetools-frontend/jest-preset-mc-app`; use `.spec.ts` (not tsx) to avoid DOM setup.

## 9. Verification

- [ ] 9.1 Local run against the scratch project.
  **Why:** prove the app works before Chrome scenarios.
  **Where:** `composed-apps/`, scratch project from manual step M3/M8.
  **How:** `cp .env.example .env` and fill `INITIAL_PROJECT_KEY`; `yarn start` (serves `http://localhost:3001`). Seed fixtures with `node e2e/fixtures/seed-composed-pages.mjs` (owned by change V; creates `e2e-orders`, `e2e-draft`, `e2e-broken`, `e2e-bq`, `e2e-param`).
  **Done when:** Chrome scenarios E2E-R-01 .. E2E-R-09 pass locally (playbook `e2e/R-composed-apps.md`, owned by V) and evidence is in `plans/evidence/r/`.
  **Watch out:** `mc-scripts start` needs the logged-in Chrome (M8).

- [ ] 9.2 Final commands.
  **How:** from repo root `node scripts/check-duplicates.mjs && node scripts/spdx-check.mjs && (cd composed-apps && yarn typecheck && yarn lint && yarn test && yarn build) && commercetools connect validate` (the last one only once B/U added the `composed-apps` entry).
  **Done when:** every command exits 0. Then run `openspec validate r-composed-apps-app --strict`.

Chrome scenario ids required: **E2E-R-01** (menu + list), **E2E-R-02** (page renders), **E2E-R-03** (empty state), **E2E-R-04** (permission denied: use the non-admin user B from M10 after the owner temporarily removes the application's View permission from B's Team, and restore it afterwards; mark SKIPPED with reason if M10 is absent; admin status is irrelevant for this app), **E2E-R-05** (generated code throws), **E2E-R-06** (data-source error isolation, legacy BIG_QUERY target), **E2E-R-07** (route param binding), **E2E-R-08** (no service/forward-to requests, zero console errors), **E2E-R-09** (page not found and legacy format).

## 10. Docs to update (for change W)

- `docs/architecture.md`: composed-apps is a pure Merchant Center GraphQL client; no service dependency.
- `docs/configuration.md`: composed-apps keys (`CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER`); note `CHAT_SERVICE_ENDPOINT_URL` not used.
- `docs/how-it-works.md`: composed page lifecycle (created by `create_composed_page`, stored as Custom Object, rendered with Babel, data sources).
- `FEATURES.md` regeneration: composed-apps section (list/table, rendering, data sources GraphQL only).
- `docs/troubleshooting.md`: "page shows Legacy Page Format", "data source unsupported target", "only first 500 pages listed".
- Scopes table in `docs/deployment.md` / README: the `oAuthScopes` list with justification.
- `composed-apps/README.md` is the per-app README required by Connect certification.
