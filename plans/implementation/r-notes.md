# Change R (r-composed-apps-app): implementation notes

## Summary

Worktree branch `worktree-agent-a6d0d0c4d75828e49`, reset to `develop` (`377cfc0`) first. All tasks ticked except 9.1 (local Chrome run needs a Merchant Center login). Task 9.2 is ticked, but `commercetools connect validate` was not run (no CLI session).

Built in `composed-apps/` (the O stub grew into the real app):
- Entry, routes (list at the root, `/:pageKey` view), `contexts/` (read-only `ComposedPagesProvider`, `ComposedPageProvider`, `data-sources-context` without BigQuery), `components/` (list, view, page-renderer, ui-error-boundary, composed-page-chart), `utils/babel-renderer.tsx`, `utils/schema-helpers.ts`, `types/`, `hooks/use-graphql`, `hooks/use-composed-pages-storage/{parse,paginate,use-composed-pages-storage}.ts`, two `.ctp.graphql` documents.
- No auth context, no `forward-to.ts`, no session bootstrap, no `CHAT_SERVICE_ENDPOINT_URL` (removed from `.env.example`, `custom-application-config.mjs`, `connect.yaml` and the layout checker).
- Pagination: first request plus `fetchMore` per further 100 rows up to 500, sorted `createdAt asc`; notice when `total > 500`.
- 25 unit tests (resolveVariables, cleanQuery, unsupportedTarget, parseComposedPage, pagination, isPageSchemaV5).
- README with scope table, security model and failure behaviour.
- Drift guard: group `composed-renderer` with 8 pairs (`babel-renderer.tsx`, `page-renderer`, `composed-page-chart`, `types/composed-page.ts`, `types/chart.ts`, `schema-helpers.ts`, `use-graphql`, `fetch-composed-page.ctp.graphql`); `composed-apps` removed from the `forward-to` group.

Commands run (all exit 0): in `composed-apps/` `yarn install`, `yarn typecheck`, `yarn lint`, `yarn test` (25 passed), `yarn build` with `.env.example` copied to `.env` (Compiled successfully, `grep -rl ngrok public` clean); at root `node scripts/check-duplicates.mjs` (27 groups; a one-character edit of `schema-helpers.ts` made it exit 1 naming both files, then reverted), `check-versions`, `check-frontend-leftovers`, `spdx-check`, `check-repo-rules`, `check-connect-layout`; `node --test scripts/tests/*.test.mjs` (114 pass); `openspec validate r-composed-apps-app --strict`.

## Questions (for the owner)

1. RQ4 (scopes): I dropped `manage_key_value_documents`, `view_mcp_servers`, `manage_mcp_servers` from the Pages app (it only reads pages and has no MCP surface) and kept the legacy `view_*`/`manage_*` commerce set. `manage_discount_codes` is still absent, so a generated page cannot edit a discount code. Confirm, or ship read-only?
2. RQ5: no delete or publish toggle in the Pages app (mc-app has delete). Confirm the default.
3. Does `createdBy` hold an e-mail? The list does not show it, but the value is read into the page object.
4. Should the cleanup of `phase2` (three keys instead of four) be accepted as part of R? I edited U's `scripts/connect/lib/config.mjs` and tests for that.

## Missed features / gaps found in the spec

- The spec and task 4.1 list the storage hook, `ui-error-boundary` and the contexts as copies from mc-app. In mc-app the error boundary depends on `useSession` and `useTabbedHeaderContext` (chat "ask the AI to fix" button), and the storage hook/contexts carry create/update/delete. They cannot be identical copies in an app without a session, so those were not copied (see Deviations).
- The O layout checker (`check-connect-layout.mjs`) and U's `connect` script assume `CHAT_SERVICE_ENDPOINT_URL` on `composed-apps` and MCP scopes on all three configs; both contradict design D2/D5. Edited consistently (see Deviations). Plan 02 and any docs saying "optional `CHAT_SERVICE_ENDPOINT_URL` for composed-apps" are now stale (change W).
- Task 2.1 says to rename the package `@commercetools-labs/...`; mc-app is named `ai-assistant-mc-app`, so I kept `ai-assistant-composed-apps`.
- Nimbus needs the `slate*` packages as peers at build time (webpack fails with "Can't resolve 'slate-history'" without them); task 2.1 and the legacy list suggested they were unused. Kept, same versions as mc-app.
- `@babel/standalone` (+ `@types/babel__standalone`), `@commercetools-frontend/sdk` (used by `use-graphql`) and `react-google-charts` are dependencies the renderer needs but the O stub did not list.
- Boolean variable conversion is `Boolean(value)`, so the string `"false"` becomes `true`. Existing behaviour in the shared contract, not changed; a page author should pass a real boolean.
- The drift check is byte equality (no prettier normalisation): O's script does not normalise and the current copies are byte-identical. When Q or the integration-cleanup junior edits the mc-app copies (for example the BigQuery remnants in mc-app's `data-sources-context.tsx`, which is not in the group), the next merge will show DRIFT and the fix is `cp` from mc-app.
- mc-app's `data-sources-context.tsx` still has the `BIG_QUERY` special case; the Pages copy uses a generic `unsupportedTarget` helper. Not shared on purpose.
- M's contract adoption (PA-M1, PA-M2): `isUsableTranspiledCode` is not used by the browser renderer (it still runs `hasReturnStatement` from mc-app's copy), and the container key is a literal in `constants.ts`, because the contract lives in `service/` and cannot be imported by a frontend build. The test `parse.spec.ts` does not read `contract/composed-page.fixture.json`. A frontend fixture test would be a follow-up for P/R together.

## TODOs (not run here)

- 9.1 Local run against the scratch project and seeding `e2e/fixtures/seed-composed-pages.mjs` (change V): needs Merchant Center login.
- E2E-R-01 .. E2E-R-09 not run (menu and list, page renders, empty state, permission denied, generated code throws, data-source error isolation with `BIG_QUERY` target, route param binding, no service requests and zero console errors, not found and legacy format). Evidence folder `plans/evidence/r/` not created.
- `commercetools connect validate` not run.
- Docs for change W listed in tasks.md section 10 (plus: `CHAT_SERVICE_ENDPOINT_URL` is no longer set for composed-apps in phase 2).
- Verify in a browser that `fetchMore` with a changed `offset` variable merges as expected (the hook concatenates the result rows itself and ignores Apollo's cache merge; a total above 100 is the case to test) and that the list shows all rows for 250 seeded pages.
- Verify that `useMcQuery` sends `sort: ["createdAt asc"]` accepted by the Custom Objects query in the proxy.

## Deviations from the spec (with reason)

- Directory `src/contexts/` (not `src/context/`): the shared renderer files import `../contexts/data-sources-context`, so identical copies need the same folder name.
- Storage hook, contexts, `ui-error-boundary` and the pages list query are Pages-specific, read-only versions and are NOT in the drift group (they differ from mc-app by design). The drift group contains the files that can be identical. `ui-error-boundary` comes from the legacy composed-apps copy with `console.error` removed.
- The Pages app has no create/update/delete hooks, no `createPage`, and the `create-or-update`/`delete` GraphQL documents are not copied; therefore `manage_key_value_documents` is not requested (spec lists only `view_key_value_documents` for reading).
- No MCP scopes in `composed-apps/custom-application-config.mjs` (design D5); `check-connect-layout.mjs` now exempts `composed-apps/` from the MCP-scope rule and has a test.
- `connect.yaml`: `CHAT_SERVICE_ENDPOINT_URL` removed from `composed-apps`; checker uses a separate key table for it; `phase2Args` in `scripts/connect/lib/config.mjs` and tests in `scripts/tests/` updated (three keys instead of four). The layout checker's message in `scripts/connect/connect.mjs` ("all four applications") is still correct.
- `img-src` no longer lists gravatar (the spec says only `*.commercetools.app` and `*.gstatic.com`). A generated page that shows a gravatar image will be blocked.
- `fetchAllPages` is a tested pure helper, but the hook itself uses `fetchMore` per offset from `remainingOffsets` (Apollo needs the query to stay in `useMcQuery` for cache and loading state); `fetchAllPages` is therefore exercised only by tests.
- jest pinned to 29.7.0 as in mc-app (the O stub had 30.2.0; aligned with mc-app, I did not test 30.2.0); `jsdom` and `@types/babel__standalone` added as dev dependencies like mc-app.
- Task 4.4 said to source `userId` from `useApplicationContext`: `babel-renderer.tsx` (copied from mc-app) already does this (`user?.id`).
- No `src/i18n/data/de.json`, `helpers.ts`, `types.ts`, `test-utils` or generated types: the O stub did not carry them.
