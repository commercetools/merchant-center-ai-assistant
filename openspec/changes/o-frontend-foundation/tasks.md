## 0. Read first

- [x] 0.1 Read, in this order: `proposal.md`, `design.md` (especially "Explore findings" 6-9 and "Decisions" D-O3..D-O9) in this folder; `plans/02-target-architecture.md`; `plans/04-workflow.md` sections 3-5.
- [x] 0.2 Read the legacy files you will copy from (read-only, never edit them), under `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/`:
  `mc-app/package.json`, `mc-app/custom-application-config.mjs`, `mc-app/src/constants.ts`, `mc-app/src/utils/forward-to.ts`, `mc-app/src/hooks/use-mc-session/index.ts`, `mc-app/src/contexts/{auth,connect,index}.tsx`, `mc-app/src/components/reauthenticate-dialog/index.tsx`, `mc-view-app/custom-view-config.mjs`, `composed-apps/custom-application-config.mjs`.
- [x] 0.3 Read the Connect skill reference `merchant-center-customizations.md` (patterns 2, 3, 5) and https://docs.commercetools.com/merchant-center-customizations/concepts/integrate-with-your-own-api.md. (not needed: verified from code and tests)

You should now be able to explain: (a) what `/proxy/forward-to` does and why no query string may be put on it; (b) why the admin flag comes only from the service's `/auth/session` answer (the user id from the verified gateway JWT is in `ADMIN_USER_IDS`) and why the app never asks the gateway for permissions or sends an e-mail as identity; (c) why the three `forward-to.ts` files are copies and not a shared module; (d) what `${env:X}` does and what it cannot reach (imported modules).

## 1. Setup

- [x] 1.1 Check the toolchain. **Where:** repo root `/Users/behnam/code/commercetools-labs/ai-assistant`.
  **How:** `node -v` (expect `v22.x`), `yarn -v` (expect `1.22.x`), `git status --short` (expect only planning files from earlier changes), `ls mc-app composed-apps mc-view-app` (B should have left stub folders; if a folder is missing, stop and finish change B first).
  **Done when:** all three folders exist and Node is 22.
- [x] 1.2 Create the working branch. **How:** `git switch -c spec/o-frontend-foundation`. **Done when:** `git branch --show-current` prints it.
- [x] 1.3 Record what B left. **How:** `ls -a mc-app composed-apps mc-view-app` and `cat connect.yaml`. **Done when:** you wrote down the env keys B declared for each app and compare with design.md D-O3; mismatches go to the change B owner, not silently into this change.

## 2. Shared helper scripts (repo root `scripts/`)

- [x] 2.1 Create `scripts/check-versions.mjs`.
  **Why:** the "one App Kit version" rule must be machine-checked, not remembered.
  **Where:** new `scripts/check-versions.mjs` (SPDX header first line).
  **How:** 1) read `mc-app/package.json`, `composed-apps/package.json`, `mc-view-app/package.json`; 2) collect every dependency whose name starts with `@commercetools-frontend/`; 3) build a Set of versions; 4) if size > 1 print each `<file> <pkg> <version>` and `process.exit(1)`; else print `OK <version>`. Use only `node:fs`/`node:path`.
  **Done when:** `node scripts/check-versions.mjs` prints `OK 27.9.6` after section 4-6 are done (before that it fails on composed-apps, which proves the check works).
  **Watch out:** `devDependencies` too; ignore non-`@commercetools-frontend/` packages (e.g. `@commercetools/nimbus` has its own version line).
- [x] 2.2 Create `scripts/check-duplicates.mjs` skeleton.
  **Why:** the three `forward-to.ts` files are deliberately duplicated (D-O9).
  **Where:** new `scripts/check-duplicates.mjs`.
  **How:** 1) `const GROUPS = [{ name: 'forward-to', files: ['mc-app/src/utils/forward-to.ts','mc-view-app/src/utils/forward-to.ts'] }];` 2) for each group read bytes, compare to the first file with `Buffer.equals`; 3) on mismatch print `DRIFT <name>: <file> differs from <first>` and the command `cp <first> <file>`; exit 1; 4) a missing file is also a failure; 5) on success print `OK duplicates (n groups)`.
  **Done when:** after task 7.x it prints `OK duplicates (1 groups)`; deliberately append a space to one copy -> exit code 1, revert.
  **Watch out:** compare bytes, not text (line endings). R and S will append groups later; keep `GROUPS` at the top of the file with a comment.
- [x] 2.3 Leftover scan command (used by Verification). **Where:** new `scripts/check-frontend-leftovers.mjs` (or a documented `grep` in `README` of scripts if A already ships one).
  **How:** scan `mc-app composed-apps mc-view-app` excluding `node_modules`, `public`, `yarn.lock`, `*.md` for: `/tenant/i`, `multitenant`, `x-mc-team-id`, `ngrok`, `run\.app`, `console\.(log|warn|error|info)`, `use-mc-teams`, `multiplatform`. Print file:line, exit 1 on any hit.
  **Done when:** exits 0 at the end of this change.

## 3. mc-app: package and tooling

- [x] 3.1 Copy tooling files. **Why:** one identical toolchain.
  **Where:** `mc-app/` <- copy from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/`: `.nvmrc`, `.prettierrc`, `.prettierignore`, `tsconfig.json`, `@types-extensions/` (whole dir), `jest.eslint.config.js`, `jest-runner-eslint.config.js`, `jest.test.config.js`, `jest.d.ts` (needed by the unit tests in 6.10). Do NOT copy `public/`, `node_modules/`, `.env`, `intl-formatter.js`, `README.md`.
  **How:** `cp` each file; for dirs `cp -R`. Add the SPDX header to `.js` config files (comment form).
  **Done when:** `ls -a mc-app` shows these and not the excluded ones. **Watch out:** `tsconfig.json` has an explanatory comment about `skipLibCheck` — keep it, it is load-bearing for Chakra generated types.
- [x] 3.2 Port `.eslintrc.js` without the dead graphql override.
  **Where:** `mc-app/.eslintrc.js` <- `.../mc-app/.eslintrc.js`.
  **How:** keep `extends: ['@commercetools-frontend/eslint-config-mc-app']`; remove `plugins:['@graphql-eslint']` and the `overrides` block (its `./schemas/ctp.json` does not exist). If change P later adds `.ctp.graphql` files it will decide on linting them.
  **Done when:** file is 8 lines. **Watch out:** also remove `@graphql-eslint/eslint-plugin` from package.json only after 3.3 shows nothing else imports it.
- [x] 3.3 Write `mc-app/package.json`.
  **Where:** new `mc-app/package.json` <- `.../mc-app/package.json`.
  **How:** 1) `name`: `@commercetools-labs/ai-assistant-mc-app`, `version` `0.1.0`, `private: true`, `engines.node` `22.x`, `license` `MIT`; 2) scripts exactly: `build`, `start`, `compile-html`, `compile-html:local`, `start:prod:local`, `lint`, `format`, `typecheck`, `versions:appkit`, `nimbus:typegen`, `generate:nimbus-surface`, `check:nimbus-surface`, `postinstall`; keep `test` (and `test:watch`) for mc-app only (unit tests of the admin sign-in helper, 6.10); delete `extract-intl`; 3) keep all dependencies, then remove, one at a time with a `yarn install && yarn typecheck` between removals, the zero-import packages listed in design.md D-O10 (start with `slate*`, `formik`, `moment`, `msw`, `zod`, `react-markdown`, `omit-empty-es`, `@commercetools/sync-actions`, `@commercetools/composable-commerce-test-data`, `@babel/core`); 4) add `"@commercetools-frontend/sdk": "27.9.6"` (it is imported but undeclared); 5) keep `resolutions` and `devDependencies`.
  **Done when:** `yarn install` ends with `Done in ...s`, `git diff --stat` shows a new `yarn.lock`, and `node -e "require('./mc-app/package.json')"` parses.
  **Watch out:** typecheck cannot pass yet (no `src/`); at this point only `yarn install` is the gate. Re-run the zero-import scan once P/Q finish (their imports may add needs). Do not delete `redux`, `react-redux`, `@emotion/*`.
- [x] 3.4 Make `postinstall` work with yarn AND npm.
  **How:** replace `yarn nimbus:typegen && yarn generate:nimbus-surface` by `npm run nimbus:typegen && npm run generate:nimbus-surface` (npm run works in both package managers' installs); same for the other two apps (`nimbus:typegen` only).
  **Done when:** `rm -rf mc-app/node_modules && cd mc-app && yarn install` still prints `nimbus:typegen` output without errors.
  **Watch out:** the surface generator exists only after task 12.1; until then temporarily omit it from postinstall and re-add in 12.1.
- [x] 3.5 `.gitignore` and `.env.example`.
  **Where:** `mc-app/.gitignore`, `mc-app/.env.example` <- legacy equivalents.
  **How:** `.gitignore`: `node_modules`, `public`, `dist`, `.env`, `.env.local`, `!.env.example`. `.env.example` content:
  ```
  # Local development only. Connect injects the deployed values from connect.yaml.
  ENABLE_NEW_JSX_TRANSFORM="true"
  FAST_REFRESH="true"
  APPLICATION_URL=https://example.invalid
  INITIAL_PROJECT_KEY=your-project-key
  CUSTOM_APPLICATION_ID=replace-with-registered-application-id
  ENTRY_POINT_URI_PATH=ai-assistant
  CLOUD_IDENTIFIER=gcp-us
  CHAT_SERVICE_ENDPOINT_URL=https://example.invalid/service
  ```
  **Done when:** `git check-ignore mc-app/.env` prints the path; `git ls-files mc-app | grep -c '^mc-app/.env$'` prints 0.
  **Watch out:** `example.invalid` (RFC 6761) rather than example.com so nobody accidentally calls a real host.

## 4. mc-app: application config

- [x] 4.1 Write `mc-app/custom-application-config.mjs`.
  **Where:** new file <- `.../mc-app/custom-application-config.mjs`.
  **How:** 1) SPDX line; 2) `name: 'AI Assistant'`; 3) keep the five `${env:...}` placeholders as in legacy; 4) `development.initialProjectKey` from `${env:INITIAL_PROJECT_KEY}`; 5) CSP per design.md D-O4 (`connect-src`: `*.commercetools.app`, `*.gstatic.com`; `script-src`: `*.commercetools.app`, `*.gstatic.com`, `'unsafe-inline'`, `'unsafe-eval'`; `img-src`: `*.gstatic.com`, `*.gravatar.com`, `gravatar.com`; `font-src`/`style-src`: `*.gstatic.com`); 6) scopes per D-O5: copy lists, delete `view_api_clients` and `manage_api_clients`, make sure `view` contains `view_mcp_servers` and `manage` contains `manage_mcp_servers`; 7) NO `additionalOAuthScopes` (REMOVED); 8) keep `icon`, `mainMenuLink` with `defaultLabel: 'AI Assistant'`, `permissions: [PERMISSIONS.View]`.
  **Done when:** `grep -c "ngrok\|run.app\|Multitenant" mc-app/custom-application-config.mjs` prints 0.
  **Watch out:** the config file imports `./src/constants` — keep that import (a `.ts` import from `.mjs` works because mc-scripts loads configs with a TS-aware loader).
- [x] 4.2 Write `mc-app/src/constants.ts`.
  **Where:** `mc-app/src/constants.ts` <- `.../mc-app/src/constants.ts`.
  **How:** keep `entryPointUriPath` (env-or-window trick, with the explanatory comment), `OAUTH_SCOPES` (with `view_mcp_servers` / `manage_mcp_servers` added to view / manage), `PERMISSIONS` = `entryPointUriPathToPermissionKeys(entryPointUriPath)` with NO group names (only the default View/Manage pair; add the comment "controls only access to the app and the MC GraphQL proxy; admin is decided by the service, see `useIsAssistantAdmin`"), `SHARED_COMPOSED_PAGES_CONTAINER_KEY`. Delete `PERMISSION_GROUPS` and `PERMISSION_GROUP_NAMES`. Remove the "warehouse"/"tenant" words. SPDX header.
  **Done when:** `grep -in "tenant\|warehouse" mc-app/src/constants.ts` prints nothing.
  **Watch out:** do not re-introduce a custom permission group: it would not make anyone an administrator (the service ignores permission claims).

## 5. mc-app: entry, i18n, minimal routes

- [x] 5.1 Port entry files. **Where:** `mc-app/src/index.tsx`, `mc-app/src/components/entry-point.tsx`, `mc-app/src/load-messages.ts`, `mc-app/public/` is NOT created (build output), plus `mc-app/index.html.template` if B's stub or legacy has it (check `.../mc-app/public/index.html.template` — it is generated into `public/`; `mc-scripts` provides it by default; only copy if the legacy repo tracks one: `git -C <legacy> ls-files mc-app | grep html`).
  **How:** copy the three files, add SPDX, in `load-messages.ts` keep only the `en` import and delete the `catch` `console.warn` (return `{}`), delete `de.json`, `core.json`; keep `en.json` = `{}`.
  **Done when:** `ls mc-app/src/i18n/data` prints `en.json` only.
- [x] 5.2 Create the minimal `mc-app/src/routes.tsx`. **Why:** O must build without P/Q.
  **Where:** new file; the full legacy file is `.../mc-app/src/routes.tsx` (P and Q will extend it).
  **How:** `ApplicationRoutes` renders `NimbusProvider` (same props as legacy: `locale`, `loadFonts={false}`, `router.navigate -> history.push`) > `AllProviders` > a `<Box>` containing `<Text>AI Assistant foundation ready</Text>` and, for debugging, the `projectKey` from `useAuth()`. Remove `console.log('match', match)`. Keep `AppWrapper` (`Box position=relative height=90vh`).
  **Done when:** typecheck passes after 6.x; the text appears in Chrome (E2E-O-01).
  **Watch out:** `NimbusProvider` must be inside `ApplicationShell` (reads data locale) — the entry point already wraps it.

## 6. mc-app: auth bootstrap and session gate

- [x] 6.1 Port `utils/forward-to.ts` with ONE deliberate change. **Where:** `mc-app/src/utils/forward-to.ts` <- `.../mc-app/src/utils/forward-to.ts`. **How:** `cp`, prepend the SPDX header (identical in the three copies), and remove the `includeUserPermissions: true` option from the `forwardToFetch` call (and its comment) so the gateway JWT is requested without permission claims; the service ignores any permissions claim (owner decision 2026-10-09). **Done when:** file starts with `// SPDX-License-Identifier: MIT` and `grep -n "includeUserPermissions\|X-Forward-To-Claims" mc-app/src/utils/forward-to.ts` prints nothing. **Watch out:** do not otherwise "tidy" the long comments; they record measured traps (no query string on the gateway URL). The two other apps get a byte copy (8.4, 9.3).
- [x] 6.2 Port `hooks/use-chat-service-endpoint/index.ts` unchanged (+SPDX) and `hooks/use-current-user.ts` unchanged (+SPDX). **Where:** `mc-app/src/hooks/...` <- legacy same names. **Done when:** files exist. **Watch out:** `useCurrentUser().email` is for display only (avatar, greeting); no request may carry it, and the service never trusts a browser e-mail (design D-O7).
- [x] 6.3 Rewrite `hooks/use-mc-session/index.ts`.
  **Where:** `mc-app/src/hooks/use-mc-session/index.ts` <- legacy same path.
  **How:** type `McSessionBootstrap = { projectKey: string; userId: string; identityMcpConfigured: boolean; isAdmin: boolean; identityUserConnected?: boolean; toolCallLogs?: 'none' | 'thinking' | 'tools' | 'all' }` (`isAdmin` and `userId` are contributed by D; the two optional fields by I and G; ignore any other field such as `workspace` or a legacy `permissions`; when `isAdmin` is missing treat it as `false`); `bootstrapSession` does `forwardToJson<BootstrapResponse>(`${endpoint without trailing slash}/auth/session`, { method: 'POST', body: '{}' })`; no `userEmail`, no `readStoredSessionId`, no query string at all (the service's feature-flag middleware reads every non-reserved query parameter as a filter - legacy comment); keep error mapping `!envelope.success -> throw new Error(envelope.error || 'Failed to establish session')`. Keep it a pure hook returning `{ bootstrapSession }`.
  **Done when:** typecheck passes; `grep -n "userEmail\|workspace\|permissions" mc-app/src/hooks/use-mc-session/index.ts` prints nothing.
  **Watch out:** the service route is POST `/service/auth/session` (change D). If D chose another path, follow D's design and amend design.md here.
- [x] 6.4 Rewrite `contexts/auth.tsx`.
  **Where:** `mc-app/src/contexts/auth.tsx` <- legacy same path (208 lines -> about 100).
  **How:** state: `bootstrapped`, `loading`, `error`, `errorStatus`, `userId`, `projectKey`, `identityMcpConfigured`, `isAdmin`. Keep the `inFlight` ref, `refresh()` and "clear error on success only" behaviour. Keep `identityUserConnected` and `toolCallLogs` as optional values exposed by the context (they stay `undefined` when the service does not send them); delete `managedMcpConfigured`, `workspace`, `fetchIdentityStatus` (Q owns the status fallback). Replace `console.error` by a thrown/stored error only (no console).
  **Done when:** `useAuth()` returns `{ isAuthenticated, loading, error, errorStatus, userId, projectKey, identityMcpConfigured, identityUserConnected?, toolCallLogs?, isAdmin, refresh }`. `userId` is exposed so P and S can show the read-only "Your user ID" line.
  **Watch out:** `ConnectProvider` and Q's gates read `refresh`; keep its identity stable (`useCallback`).
- [x] 6.5 Port `components/reauthenticate-dialog/index.tsx` (+SPDX) unchanged. **Where:** `mc-app/src/components/reauthenticate-dialog/index.tsx` <- legacy same. **Done when:** file compiles; 401 -> "Sign in again" primary (navigates to `/logout?reason=unauthorized`), other errors -> "Retry" primary.
- [x] 6.6 Write the foundation `contexts/connect.tsx`.
  **Where:** `mc-app/src/contexts/connect.tsx` <- legacy same.
  **How:** keep `ConnectContext { recheck }`; render order: loading -> `LoadingSpinner`; `error || !isAuthenticated` -> text + `ReauthenticateDialog`; else children. Add a comment block "Q extends this with the identity binding and connect gates (see change q-mc-app-admin-surfaces)". Remove imports of `ManagedMcpPage`, `IdentityConnectGate`.
  **Done when:** typecheck passes.
- [x] 6.7 Write `contexts/index.tsx` with only `AuthProvider` and `ConnectProvider` in `AllProviders`; export `useAuth`, `useConnect`. **Where:** `mc-app/src/contexts/index.tsx` <- legacy. **How:** P and Q append their providers in the order shown in the legacy file (Backoffice, ToolCallLogs, MCPConfig, SystemPrompt, ComposedPages, TabbedHeader, Session). **Done when:** typecheck passes.
- [x] 6.8 Rewrite `hooks/use-assistant-admin/index.ts` (+SPDX).
  **Why:** admin is decided by the service; the UI only mirrors it.
  **Where:** `mc-app/src/hooks/use-assistant-admin/index.ts` <- legacy same path.
  **How:** keep the exported name `useIsAssistantAdmin`; body: `const { isAdmin, isAuthenticated } = useAuth(); return isAuthenticated && isAdmin === true;`. Remove `useIsAuthorized` and every `PERMISSIONS` import. Docblock: "UX gate only. Admin = the service decided (the gateway-verified user id is in ADMIN_USER_IDS) and returned `isAdmin` in POST /auth/session. Never read a Merchant Center permission, localStorage, a header or a browser e-mail here. Every admin route is requireAdmin on the service."
  **Done when:** typecheck passes; `grep -n "useIsAuthorized\|PERMISSIONS" mc-app/src/hooks/use-assistant-admin/index.ts` prints nothing.
  **Watch out:** return false while loading or failed (fail closed).
- [x] 6.9 Unit test for `useIsAssistantAdmin`. **Where:** new `mc-app/src/hooks/use-assistant-admin/use-assistant-admin.spec.tsx` (jest + `@testing-library/react` `renderHook`; mock `useAuth`; if the dev dependencies are missing add `@testing-library/react` and the App Kit jest preset already used by `jest.test.config.js`). **How:** cases: `useIsAssistantAdmin` is false for `isAdmin` undefined, false, and while loading or errored, and true only for `isAuthenticated && isAdmin: true`; a second case asserts `useAuth()` exposes `userId` from a mocked bootstrap. **Done when:** `cd mc-app && yarn test` exits 0 with these cases listed. **Watch out:** the hook must not read `localStorage` or `window.location`; add an assertion that sets both to an administrator's id and still gets false.

## 7. mc-app first green build

- [x] 7.1 Delete nothing from legacy; simply do not copy: `helpers.ts`, `types.ts`, `types/generated/ctp.ts`, `test-utils/`, `graphql.d.ts`, `hooks/use-mc-teams/`. **Done when:** `find mc-app/src -type f | wc -l` is about 15.
- [x] 7.2 Run the gates. **How:** `cd mc-app && yarn typecheck && yarn lint && yarn test && yarn build`. **Expected:** `tsc` exits 0; lint prints `PASS` lines; build ends with `Compiled successfully` (or the mc-scripts equivalent) and creates `public/index.html`. **Done when:** all three exit 0. **Watch out:** `yarn build` needs the env vars from `.env` — `cp .env.example .env` (git-ignored) first.
- [x] 7.3 SPDX pass. **How:** `node scripts/spdx-check.mjs mc-app` (script from change A; if A named it differently use that name). **Done when:** exit 0.

## 8. composed-apps alignment

- [x] 8.1 Tooling copy. **Where:** `composed-apps/` <- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/composed-apps/`: `.nvmrc`, `.prettierrc`, `.prettierignore`, `tsconfig.json`, `@types-extensions/`, `jest.eslint.config.js`, `jest-runner-eslint.config.js`, `.eslintrc.js` (same simplification as 3.2). **Done when:** `diff -r mc-app/@types-extensions composed-apps/@types-extensions` prints nothing.
- [x] 8.2 `composed-apps/package.json`. **How:** start from the legacy file; name `@commercetools-labs/ai-assistant-composed-apps`; set every `@commercetools-frontend/*` to `27.9.6` (`sed -i '' 's/"25.1.0"/"27.9.6"/' composed-apps/package.json` for those lines only - check with `git diff`); add `engines.node` `22.x`; same script set as 3.3 minus `generate:nimbus-surface` unless R needs the surface file (R decides; leave `postinstall: npm run nimbus:typegen`); same pruning rule; add `@commercetools-frontend/sdk` if imported. `yarn install`. **Done when:** `node scripts/check-versions.mjs` prints `OK 27.9.6` for mc-app + composed-apps (view comes in section 9).
- [x] 8.3 `composed-apps/custom-application-config.mjs` and `constants.ts` and `.env.example`/`.gitignore`. **Where:** from legacy same paths. **How:** name `AI Assistant Pages`, icon `message-chatbot.svg`, placeholders as in 4.1 (entry point default in `.env.example`: `ai-assistant-pages`), same CSP as mc-app, scopes: legacy list unchanged; `constants.ts`: `entryPointUriPathToPermissionKeys(entryPointUriPath)` with no groups (keep the explanatory comment); keep `SHARED_COMPOSED_PAGES_CONTAINER_KEY`. SPDX. **Done when:** `grep -c "ngrok\|run.app" composed-apps/custom-application-config.mjs` prints 0.
- [x] 8.4 Stub entry so it builds. **Where:** `composed-apps/src/{index.tsx,components/entry-point/index.tsx,load-messages.ts,routes.tsx,i18n/data/en.json}` (no `forward-to.ts`: composed-apps makes no service calls, change R). **How:** copy `index.tsx`, entry point, `load-messages.ts` like 5.1 (legacy `composed-apps/src/components/entry-point/`); `routes.tsx` = `<Text>AI Assistant Pages foundation ready</Text>` inside `NimbusProvider`; `forward-to.ts` = `cp mc-app/src/utils/forward-to.ts`. **Done when:** `cd composed-apps && yarn install && yarn typecheck && yarn lint && yarn build` exit 0. **Watch out:** R replaces `routes.tsx` and the contexts; do not port any legacy page code here.

## 9. mc-view-app alignment

- [x] 9.1 Tooling + package.json + `.env.example` as in 8.1-8.2. **How:** name `@commercetools-labs/ai-assistant-mc-view-app`; versions already 27.9.6 - confirm; keep `ai` and `@ai-sdk/react` deps (S needs them). **Done when:** `node scripts/check-versions.mjs` prints `OK 27.9.6`. **Watch out:** never copy the untracked `.env` in the legacy folder.
- [x] 9.2 `mc-view-app/custom-view-config.mjs` and `src/constants.ts`. **Where:** from legacy same paths. **How:** `name: 'AI Assistant'`; placeholders `CUSTOM_VIEW_ID`, `APPLICATION_URL`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`; delete `hostUriPath` hard-coded product id: use `hostUriPath: '${env:HOST_URI_PATH}'` and document `HOST_URI_PATH=/your-project-key/products/<product-id>` in `.env.example`; CSP as D-O4 WITHOUT `'unsafe-eval'`; `locators`: reduce to the single entry `'categories'` (first entry of the legacy list) with the comment `// S replaces this with the full 65-locator list`; keep `oAuthScopes` as legacy plus `view_mcp_servers` in `view` and `manage_mcp_servers` in `manage` (they moved here from the REMOVED permission group); NO `additionalOAuthScopes`. `constants.ts`: no permission groups (drop the long prefix explanation). SPDX. **Done when:** config has no `us-store`, no ngrok, no run.app.
- [x] 9.3 Stub entry + `utils/forward-to.ts` copy (as 8.4) with `<Text>AI Assistant view foundation ready</Text>`. **Done when:** `yarn typecheck && yarn lint && yarn build` exit 0 inside `mc-view-app`. **Watch out:** `yarn start` renders the view inside a dummy host page (needs `hostUriPath`).
- [x] 9.4 Drift and leftover gates. **How:** `node scripts/check-duplicates.mjs && node scripts/check-versions.mjs && node scripts/check-frontend-leftovers.mjs`. **Expected:** `OK duplicates (1 groups)`, `OK 27.9.6`, exit 0. **Done when:** all three succeed.

## 10. Register and run against a real project (needs manual steps)

- [ ] 10.1 Needs owner manual steps M6 (Custom Applications registered: you receive two `CUSTOM_APPLICATION_ID`s and entry-point paths), M7 (Custom View id), M8 (Chrome logged in to Merchant Center), M10 (admin user A whose user id is in `ADMIN_USER_IDS`, non-admin user B, both with the app's ordinary Manage permission). If any is missing, write the exact missing item into `plans/questions-inbox/OPQ-manual-steps.md` status and skip to Verification part A only.
- [ ] 10.2 Local run. **How:** `cd mc-app && cp .env.example .env`, fill `CUSTOM_APPLICATION_ID`, `INITIAL_PROJECT_KEY`, `ENTRY_POINT_URI_PATH`, `CHAT_SERVICE_ENDPOINT_URL` (a reachable service: the sandbox deployment from change U, or a tunnel you start yourself and never commit); `yarn start`. **Expected:** `Local: http://localhost:3001`. Open the printed MC URL. **Done when:** page shows `AI Assistant foundation ready` (E2E-O-01).

## 11. Chrome scenarios (run with `mcp__chrome-devtools__*`; evidence in `plans/evidence/O/`)

- [ ] 11.1 E2E-O-01 bootstrap works. **Pre:** 10.2 done, service reachable with `MC_AUTH_DISABLED` unset. **Steps:** `navigate_page` to the app URL, `wait_for` text `AI Assistant foundation ready`, `list_network_requests` filter `forward-to`. **Assert:** one POST `.../proxy/forward-to` returned 200; response JSON (`get_network_request`) has `data.projectKey`, `data.userId`, `data.isAdmin` (boolean), `data.identityMcpConfigured` (boolean), and no `permissions` field; optional `identityUserConnected`/`toolCallLogs` are recorded if present. **Evidence:** `O-01-network.json`, `O-01.png` via `take_screenshot`.
- [ ] 11.2 E2E-O-02 request shape. **Steps:** `get_network_request` of the bootstrap. **Assert:** URL path is exactly `/proxy/forward-to` (no `?`); request headers contain `x-forward-to` ending `/service/auth/session` and `x-forward-to-audience-policy: forward-url-full-path`; no `authorization` header beyond the gateway's own; `localStorage` has no service token (`evaluate_script`: `Object.keys(localStorage)`).
- [ ] 11.3 E2E-O-03 admin flag. **Pre:** M10 done (user A = admin user, user id in `ADMIN_USER_IDS`; user B = non-admin user). **Steps:** (a) as the admin user, (b) as the non-admin user (switch user in the same Chrome profile or ask the owner once via manual step M10), repeat the bootstrap. **Assert:** (a) `data.isAdmin` is `true`, (b) `false`; neither response contains an e-mail or `permissions`; both contain the caller's own `userId`. (c) Forged label: as user B, `evaluate_script` sets `localStorage.userEmail`/`x-admin-email`-style entries to user A's e-mail or user id and reloads; the bootstrap still says `isAdmin:false`. **Done when:** both responses are saved as evidence (values of `userId` redacted).
- [ ] 11.4 E2E-O-04 no CSP errors. **Steps:** reload; `list_console_messages`. **Assert:** zero messages containing `Content Security Policy`; zero `error` level messages from our code.
- [ ] 11.5 E2E-O-05 reauth/retry gate. **Steps:** `evaluate_script` is not able to break the gateway, so restart `yarn start` with `CHAT_SERVICE_ENDPOINT_URL=https://example.invalid/service`, reload. **Assert:** dialog appears with "Retry" as primary (non-401 error) and the page behind shows the "unavailable" sentence; restoring the right URL and pressing Retry (after restart) shows the ready text. **Clean up:** restore `.env`.
- [ ] 11.6 Repeat 11.1, 11.4 for `composed-apps` (its own entry-point path) and for `mc-view-app` (open any registered locator page, e.g. a category page, and find the panel). **Assert:** foundation text visible, no CSP errors. The bootstrap of the view shows the same `isAdmin` as in mc-app for the same user.
- [ ] 11.7 E2E-O-06 own user id exposed. **Steps:** as user A and as user B, `evaluate_script` is not needed: read the `/auth/session` response with `get_network_request`. **Assert:** `data.userId` is a non-empty string different for A and B and equals the id the owner lists for each in M10. **Evidence:** `O-06-network.json` (ids redacted). The visible "Your user ID" line is verified by change P (E2E-P scenario) and S.

## 12. Nimbus surface generator

- [x] 12.1 Port the generator. **Where:** `mc-app/scripts/generate-nimbus-surface.mjs` <- `.../mc-app/scripts/generate-nimbus-surface.mjs`; output `mc-app/src/utils/nimbus-surface.generated.ts` (committed; legacy has it, 191 lines). **How:** SPDX; delete the `ROUTER_COPY` constant and its write block; add `--out <path>` (already supported) and document in the header that change H/M's service copy is produced with `yarn generate:nimbus-surface --out ../service/src/<path>` (path fixed by those changes); keep `--check`. Re-add `npm run generate:nimbus-surface` to `postinstall`. **Done when:** `cd mc-app && yarn generate:nimbus-surface && git diff --stat src/utils/nimbus-surface.generated.ts` shows no diff beyond the SPDX header; `yarn check:nimbus-surface` exits 0. **Watch out:** the generated file also needs an SPDX header: have the script emit it.

## 13. Verification

- [x] 13.1 Gates in every folder: `for d in mc-app composed-apps mc-view-app; do (cd $d && yarn install --frozen-lockfile && yarn typecheck && yarn lint && yarn build) || echo FAIL $d; done`. **Expected:** no `FAIL`. Additionally `cd mc-app && yarn test` exits 0 (admin sign-in helper tests, 6.10).
- [x] 13.2 Root gates: `node scripts/check-versions.mjs` -> `OK 27.9.6`; `node scripts/check-duplicates.mjs` -> `OK duplicates (1 groups)`; `node scripts/check-frontend-leftovers.mjs` -> exit 0; `node scripts/spdx-check.mjs` -> exit 0; `git ls-files | grep -E '(^|/)\.env$'` -> empty; `ls package.json 2>/dev/null` -> no root manifest with `workspaces`.
- [ ] 13.3 `commercetools connect validate` (CLI) from repo root passes if B's `connect.yaml` exists; record output.
- [ ] 13.4 Chrome scenarios E2E-O-01..06 pass (section 11) with evidence under `plans/evidence/O/`.
- [x] 13.5 `openspec validate o-frontend-foundation --strict` passes.

## 14. Docs to update (for change W)

- README: prerequisites (Node 22, yarn 1, no workspace), per-app env table (D-O3), "register first, fix URL last", how to run `yarn start` against a deployed sandbox service.
- docs/architecture: forward-to flow (no custom claims requested), the admin model (`ADMIN_USER_IDS`, `isAdmin` and `userId` in the bootstrap).
- docs/config-reference: every env variable of the three apps, the CSP list, the scopes and why.
- CONTRIBUTING: running `scripts/check-versions.mjs`, `check-duplicates.mjs`, `check-frontend-leftovers.mjs` before a PR; bumping App Kit = change all three package.json together (`yarn versions:appkit`).
- FEATURES.md regeneration: App Kit 27.9.6, no extra permission groups, admin by `ADMIN_USER_IDS`, no team MCP, no tracked `.env`.
