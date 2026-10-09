# Change O (o-frontend-foundation): implementation notes

## Summary

Done on the worktree branch `worktree-agent-ac5e5c8dd6559c06b` (fast-forwarded to `develop`, which holds A and B). Tasks 0.1-9.4, 12.1, 13.1, 13.2 and 13.5 are ticked. Not done (need the owner, Chrome login or Docker): 0.3, 10.x, 11.x, 13.3, 13.4.

Added or changed:
- `scripts/check-versions.mjs`, `scripts/check-duplicates.mjs` (three `forward-to.ts` copies), `scripts/check-frontend-leftovers.mjs`.
- `mc-app`: `src/utils/forward-to.ts` (SPDX added, `includeUserPermissions` removed), `hooks/{use-mc-session,use-chat-service-endpoint,use-assistant-admin}`, `hooks/use-current-user.ts`, `contexts/{auth,connect,index}.tsx`, `components/reauthenticate-dialog`, minimal `routes.tsx` (NimbusProvider + AllProviders + "AI Assistant foundation ready"), `scripts/generate-nimbus-surface.mjs` and the generated `src/utils/nimbus-surface.generated.ts`, 6 jest tests (`use-assistant-admin.spec.tsx`), English-only i18n, full config (CSP, scopes, placeholders).
- `composed-apps`, `mc-view-app`: same tooling, config (CSP, scopes), `forward-to.ts` byte copy, stub `routes.tsx` with NimbusProvider and the "foundation ready" text.
- `useAuth()` exposes `{isAuthenticated, loading, error, errorStatus, userId, projectKey, identityMcpConfigured, isAdmin, identityUserConnected?, toolCallLogs?, refresh}`; `useIsAssistantAdmin()` reads only `isAdmin` and is false while loading, failed or when absent.

Commands run (all exit 0):
- In each of `mc-app`, `composed-apps`, `mc-view-app`: `yarn install --frozen-lockfile`, `yarn typecheck`, `yarn lint`, `yarn build` with the `.env.example` values exported (`public/index.html` created, "Compiled successfully").
- `mc-app`: `yarn test` -> 6 passed; `yarn check:nimbus-surface` -> up to date (Nimbus 3.6.0).
- Root: `node scripts/check-versions.mjs` -> `OK 27.9.6`; `check-duplicates.mjs` -> `OK duplicates (1 groups)`, and a deliberate trailing space makes it exit 1 with a `cp` hint; `check-frontend-leftovers.mjs` -> OK; `spdx-check.mjs` -> ok; `check-repo-rules.mjs` -> ok; `check-connect-layout.mjs` -> `connect layout ok (4 applications)`; `node --test scripts/tests/*.test.mjs` -> 28 pass; `openspec validate o-frontend-foundation --strict` -> valid.
- Missing variable check: build without `CHAT_SERVICE_ENDPOINT_URL` fails with `Missing environment variable 'CHAT_SERVICE_ENDPOINT_URL'`.
- Production-like build without `INITIAL_PROJECT_KEY` / `HOST_URI_PATH` also passes (see Deviation 1).

## Questions (for the owner)

1. Q-O3 stays open: does Connect build the MC apps with yarn or npm? `postinstall` uses `npm run ...` so both work, but this is unverified (needs a real deploy).
2. Keep the composed-apps `view_mcp_servers`/`manage_mcp_servers` scopes? B's spec and checker require them in all three configs, O's D-O5 says "composed-apps keeps its legacy list" (no MCP scopes). I followed B (superset). If composed-apps needs no MCP, relax B's checker and drop the two scopes (least privilege).
3. mc-app and composed-apps keep ~50 commerce scopes (legacy list minus api-client scopes) per D-O5. Q-O2 (trim to what generated pages need) is still the owner's call.
4. Package names are `ai-assistant-mc-app` etc. (B's unscoped dev names, accepted by A's checker) instead of the `@commercetools-labs/...` names in the task text. Confirm AQ1.

## Missed features / gaps found in the spec

- **Connect build vs dev-only placeholders.** The config loader fails the production build when ANY `${env:...}` placeholder is unset, including the `development` section. `INITIAL_PROJECT_KEY` (task 4.1, D-O3) and `HOST_URI_PATH` (task 9.2) are not in `connect.yaml` and Connect will not provide them, so the Connect build would fail with `Missing environment variable 'INITIAL_PROJECT_KEY'`. Also `env.development.initialProjectKey` is a required schema property, so it cannot simply be omitted. Fixed with `process.env.X || 'unset-dev-only'` (Deviation 1). The spec should state this.
- **A's `.env.example` rule vs task 3.5.** `check-repo-rules.mjs` rejects any key containing `KEY` with a non-empty value that is not a plain slug, so the specified `INITIAL_PROJECT_KEY=your-project-key` passes the slug test but is still rejected by the `KEY` name rule, and `HOST_URI_PATH=/your-project-key/products/<id>` fails the value regex. I left both empty with a comment (Deviation 4).
- **Nimbus peer dependencies.** D-O10/task 3.3 list `slate*` as zero-import and removable. They are peer dependencies of `@commercetools/nimbus` 3.6.0 (`slate`, `slate-history`, `slate-hyperscript`, `slate-react`), and `slate-react` needs `slate-dom`. Without them `generate-nimbus-surface` (postinstall) fails with `Cannot find package 'slate'`. Added to all three apps (`^0.123.0` / `^0.115.0` as the peers require, not the legacy `^0.126`). `@chakra-ui/react` and `@commercetools/nimbus-tokens` are also needed by `nimbus:typegen`.
- B's prune had already removed Nimbus/Chakra from all three apps, so O had to re-add them (the spec assumes B left them).
- `jest.eslint.config.js` and `jest-runner-eslint.config.js` (task 3.1) do not exist any more: B moved to ESLint 9 flat config (see B notes). `.eslintrc.js` (3.2, 8.1) was not recreated for the same reason; `eslint.config.js` is the equivalent.
- Task 2.2 skeleton lists only mc-app and mc-view-app copies of `forward-to.ts`, but the spec requirement and task 8.4/9.3 need three copies. I used three.
- Task 2.3 pattern list contains `multitenant` and `/tenant/i` (redundant); fine. The generated Nimbus file and `README` are not scanned (`*.md` skipped by the spec).
- Task 4.2 says keep `OAUTH_SCOPES` in `constants.ts`; with no permission groups it has no consumer, so it is not there (B had already dropped it).
- Task 6.9 and 7.2/13.1 refer to "6.10" for the unit test (the test task is 6.9).
- Task 3.3 says `test` keeps `jest` only for mc-app and the other apps get an echo script: done. `jest` is 29.7.0 in mc-app but 30.2.0 in mc-view-app (B left it); harmless, not aligned.
- `check-versions.mjs` only checks `@commercetools-frontend/*`; `jest`, `@babel/core`, `@tabler/icons` still differ slightly between apps (not covered by the spec).
- `scripts/check-frontend-leftovers.mjs` has no test; the spec asks only for the command.
- The spec scenario "Config compiles with env supplied ... `window.app.entryPointUriPath` equals the supplied path" was checked by grepping `public/index.html` for mc-app only.
- `@types-extensions/json-stable-stringify/package.json` (copied by B) failed A's `spdx-check --names` (`BAD NAME`, `NOT PRIVATE`). Fixed by renaming to `ai-assistant-types-json-stable-stringify` and adding `"private": true` in all three apps (typecheck still passes; nothing imports it right now). Probably should be deleted by P/R when confirmed unused.

## TODOs

- Not run: 0.3 (the Connect skill reference and the Connect docs were not read; the work followed the repo's design.md), 10.1/10.2 (needs M6-M10 and a reachable service), 11.1-11.7 and 13.4 (Chrome login to Merchant Center, deployed service). E2E scenario ids not run: **E2E-O-01, E2E-O-02, E2E-O-03, E2E-O-04, E2E-O-05, E2E-O-06**, plus the composed-apps and mc-view-app repeats in 11.6. No evidence under `plans/evidence/O/`.
- 13.3 `commercetools connect validate`: Docker is not available here (same as B).
- Unverified without a browser: CSP completeness (E2E-O-04), that `NimbusProvider` inside `ApplicationShell` renders, that the `chatServiceEndpointUrl` reaches `window.app.additionalEnv`, and that the `?? 'unset-dev-only'` project key does not confuse `yarn start` when `INITIAL_PROJECT_KEY` is empty (it then points at a project that does not exist, which is the intended "set it" signal).
- `yarn start` was not run (needs MC login).
- Port `SHARED_COMPOSED_PAGES_CONTAINER_KEY` into the shared contract once change M defines it (PA-M2); today it is a literal `'shared-composed-pages'` in `mc-app/src/constants.ts` and `composed-apps/src/constants.ts`.
- `scripts/check-duplicates.mjs`: R and S append their groups.
- The yarn install prints `warning Workspaces can only be enabled in private projects` when running `yarn add/remove` (comes from `@manypkg/cli` being present); harmless.
- `identityUserConnected` and `toolCallLogs` are carried through the context but nothing reads them yet (Q and P do).

## Deviations from the spec (with reason)

1. **`initialProjectKey` and `hostUriPath` are not `${env:...}` placeholders.** They are `process.env.INITIAL_PROJECT_KEY || 'unset-dev-only'` and `process.env.HOST_URI_PATH || '/unset-dev-only/categories'`. Reason: see the first gap; a placeholder breaks the Connect production build because neither variable is declared in `connect.yaml`. The five deploy values (`applicationId`/`customViewId`, `url`, `entryPointUriPath`, `cloudIdentifier`, `chatServiceEndpointUrl`) are still placeholders only.
2. **ESLint 9 flat config** (`eslint.config.js`, `eslint .`) instead of `.eslintrc.js` + jest-runner-eslint (B's decision). I added to each config an override turning off `no-template-curly-in-string` for `custom-*-config.mjs` (the `${env:...}` placeholders), which removes the six warnings B documented, and ignored the generated `nimbus-surface.generated.ts` in mc-app's ESLint and Prettier ignore files.
3. **Package names** unscoped (`ai-assistant-<app>`), see Question 4.
4. **`.env.example`**: `INITIAL_PROJECT_KEY=` and `HOST_URI_PATH=` are empty (comments explain), and `APPLICATION_URL`/`CHAT_SERVICE_ENDPOINT_URL` use `https://example.invalid[...]` as in task 3.5. Reason: A's `check-repo-rules` rules.
5. **Branch**: stayed on the worktree branch instead of `spec/o-frontend-foundation` (task 1.2), as A and B did.
6. **mc-view-app** keeps `view_mcp_servers`/`manage_mcp_servers` (task 9.2 and B's checker), and its dev host page is `/<project>/categories` to match the single `categories` locator, not a product page.
7. **composed-apps** scopes: legacy list plus the two MCP scopes (Question 2).
8. **Dependencies**: removed only `msw` additionally (zero imports); `@babel/core` was kept (App Kit peer). Added `@manypkg/cli` (script `versions:appkit`), `@commercetools-frontend/sdk` (mc-app only, imported later by P/Q), `ai` and `@ai-sdk/react` to mc-view-app only (task 9.1; `ai@7.0.92`, `@ai-sdk/react@^4.0.95` from the legacy package.json, unverified as installable together).
9. **`McSessionBootstrap` normalisation**: `useMcSession` returns `identityMcpConfigured` as `Boolean(...)` and `isAdmin` as `data.isAdmin === true`, so the hooks never see `undefined` there.
10. **`mc-app/src/graphql.d.ts`** was deleted (nothing imports `.graphql`); P can restore it if it adds graphql files. composed-apps and mc-view-app keep theirs.
11. `useCurrentUser` is copied unchanged (legacy fallback `'anonymous'` for the e-mail); it is display-only and nothing in O sends it.
