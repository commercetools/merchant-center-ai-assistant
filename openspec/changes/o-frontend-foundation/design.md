## Context

Change O of the A-to-Z plan. It lays the common ground for the three Merchant Center frontends so P, Q, R and S
only add features. It follows the `commercetools-connect` skill (Merchant Center customizations reference):
`${env:...}` placeholders, no `endpoint` / no `securedConfiguration` for MC apps, `APPLICATION_URL` injected by Connect,
register-first / fix-URL-last, all `@commercetools-frontend/*` packages on one version.

## Explore findings

Facts verified against the legacy checkout `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app` (HEAD `e5626a0`) on 2026-10-08. `L/` = that path.

1. **FEATURES.md is stale; code wins.** FEATURES.md says App Kit 24.11/25.1/26.1, a list of extra permission pairs and a tracked `.env`; reality:
   `L/mc-app/package.json` and `L/mc-view-app/package.json` use `27.9.6`, `L/composed-apps/package.json` uses `25.1.0`; `L/mc-app/src/constants.ts` registered **one** extra admin permission pair carrying `manage_mcp_servers` (REMOVED in the target: see D-O6); `git ls-files | grep env` lists only `.env.example` files (commit `2d46430` removed the tracked `.env`). `mc-app/.env.example` still contains `ENTRY_POINT_URI_PATH=multitenant-chat-app`.
2. **Node/yarn.** `.nvmrc` = `22` (mc-app); `engines.node` `22.x` in mc-app and mc-view-app, absent in composed-apps (`L/composed-apps/package.json`). Each folder has its own `yarn.lock`; no root `package.json`; root `yarn.lock` is an empty stub; `netlify.toml` is an SPA rewrite. The Connect docs say install uses Yarn and that lockfiles must be pushed (https://docs.commercetools.com/connect/development.md, "Manage the application with Yarn commands" and "Upload and create a release on GitHub"); the Connect skill reference `monorepo-with-storefront.md` says Connect runs the install and build **inside each app folder** and forbids a workspaces root.
3. **Script drift.** mc-app has `postinstall: yarn nimbus:typegen && yarn generate:nimbus-surface` (`L/mc-app/package.json`); the other two only `yarn nimbus:typegen`. All three keep `extract-intl` + `intl-formatter.js` although i18n files are `{}` (`L/mc-app/src/i18n/data/{en,de}.json`; `core.json` holds starter `Channels.*` strings). `test` is `echo 'No tests'` everywhere; `lint` is `jest --config jest.eslint.config.js` (jest-runner-eslint).
4. **Unused dependencies.** An import scan of `L/mc-app/src` finds zero imports of: `slate*`, `formik`, `moment`, `redux`, `react-redux`, `msw`, `zod`, `react-markdown`, `@babel/core`, `@emotion/*`, `@commercetools/sync-actions`, `omit-empty-es`, `graphql-tag`, `@commercetools/composable-commerce-test-data`. `@commercetools-frontend/sdk` is **imported** (`hooks/use-graphql`, `hooks/use-managed-mcp`) but is **not declared** in package.json (transitive). `@apollo/client`, `@babel/standalone`, `alasql`, `react-google-charts`, `@tabler/icons-react`, `agentation`, `ai`, `@ai-sdk/react`, `@chakra-ui/react` are used.
5. **Config.** `L/mc-app/custom-application-config.mjs`: `name: 'Multitenant Chat App'`; already placeholders for `ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER`, `CUSTOM_APPLICATION_ID`, `APPLICATION_URL`, `CHAT_SERVICE_ENDPOINT_URL`; `development.initialProjectKey` from `INITIAL_PROJECT_KEY`. CSP `script-src` lists `*.ngrok-free.app`, `localhost:8080`, three `*.run.app` regions and `'unsafe-inline'`/`'unsafe-eval'`; `connect-src` is only `*.commercetools.app` and `*.gstatic.com` because the browser never calls the service directly. `oAuthScopes` view=21 / manage=33 (includes `*_api_clients`, used by the removed `use-create-api-client`), no `additionalOAuthScopes` in the target (the legacy extra permission pair is REMOVED, see D-O6), menu link behind `PERMISSIONS.View`, icon `@tabler/icons/outline/robot.svg`. `composed-apps` config is the same shape with its own name/icon and no api_clients scopes; `mc-view-app/custom-view-config.mjs` has `type: 'CustomPanel'`, `typeSettings.size: 'SMALL'`, 65 `locators`, `development.hostUriPath` pointing at a hard-coded product id (`/us-store/products/e3c6...`) and the same CSP.
6. **Entry point path in code.** `L/mc-app/src/constants.ts` reads `process.env.ENTRY_POINT_URI_PATH || window.app.entryPointUriPath` because the `${env:}` substitution never reaches imported modules; the legacy file derived `PERMISSIONS` with `entryPointUriPathToPermissionKeys(entryPointUriPath, [...groupNames])`. In the target only the default `{View,Manage}<EntryPointPascal>` pair remains (it gates opening the app and the MC GraphQL proxy, NOT admin; see D-O6). `mc-view-app/src/constants.ts` exports no `PERMISSIONS` (App Kit 26 had no public custom-view helper); the legacy warning about unprefixed extra permission names becoming global is moot because the target declares none.
7. **Permission and claim facts.** For a Custom Application the default permissions are `{View,Manage}<EntryPointUriPath>`; for a Custom View `{View,Manage}` plus the host's (https://docs.commercetools.com/merchant-center-customizations/concepts/oauth-scopes-and-user-permissions.md). The gateway JWT carries user id and project key and NO e-mail; permissions only if asked. Decision 2026-10-09: the frontends never ask (no `includeUserPermissions`, no `X-Forward-To-Claims`) and the service ignores any permissions claim, so there is no per-surface permission key to capture or match (the old Q-O1 and its capture task are REMOVED). Admin is decided by the service (gateway-verified user id in `ADMIN_USER_IDS`) and delivered as `isAdmin` in the bootstrap (D-O6).
8. **forward-to.** `diff` shows `L/mc-app/src/utils/forward-to.ts` identical to the copies in mc-view-app and composed-apps (196 lines). Key traps documented in the file: no query string on the gateway URL (CORS preflight echo of `x-forward-header-*` only works on the exact path `/proxy/forward-to`; `cache: 'no-store'` removes the Chrome per-URL cache lock), `content-type` is set on the gateway hop only and not relayed, 401 retried once with `X-Force-Token` by `executeHttpClientRequest`, `forwardToJson` throws `ForwardToError{status, body}`. Doc check: `X-Forward-To-Audience-Policy` default is `forward-url-full-path` (same Connect-MC doc as item 7).
9. **Bootstrap.** `L/mc-app/src/hooks/use-mc-session/index.ts` posts `{sessionId}` to `auth/session?userEmail=` and expects `{projectKey,userId,managedMcpConfigured,identityMcpConfigured,identityUserConnected,toolCallLogs,workspace}`; `contexts/auth.tsx` falls back to `GET managed-mcp-identity/status` when `identityUserConnected` is undefined (a "deploy window" shim). `contexts/connect.tsx` gates: loading -> spinner; failure -> `ReauthenticateDialog`; `!managedMcpConfigured` -> `ManagedMcpPage`; `!identityUserConnected` -> `IdentityConnectGate`; else children. Target contract (plans/01 table, row "POST /auth/session", amended 2026-10-09): `{projectKey, userId, identityMcpConfigured, isAdmin}` with no project auto-registration and no `permissions`.
10. **Tenancy remnants.** `x-mc-team-id`/`contexts/team.tsx` are already gone from the tree; what remains is `hooks/use-mc-teams/` (two `.administration.graphql` files, unverified shapes), `McTeam` in `hooks/use-managed-mcp/types.ts`, and a `useOrganizationAdministrators` import in `components/managed-mcp/permission-notice.tsx` (Q). `userEmail` is sent as a query param by ~20 connector calls and by `use-mc-session`; D6/plans/01 say the service must trust the verified `userId` only.
11. **Starter leftovers** confirmed present: `src/helpers.ts`, `src/types.ts`, `src/types/generated/ctp.ts` (12.5k lines), `src/test-utils/index.tsx`, `src/i18n/data/core.json`, `.eslintrc.js` graphql override pointing at non-existent `./schemas/ctp.json`, 77 `console.*` calls, `console.log('match', match)` in `routes.tsx`, `public/` build output on disk (git-ignored).
12. **Nimbus surface generator.** `L/mc-app/scripts/generate-nimbus-surface.mjs` imports Nimbus under jsdom and writes `src/utils/nimbus-surface.generated.ts`; it also refreshes a router copy at `../../multitenant-ai-assistant-router/service/src/functional-agent/agents/prompts/nimbus-surface.generated.ts` when that sibling exists (`ROUTER_COPY`). That path does not exist in the target repo.
13. **mc-view-app** has no `PERMISSIONS`, adds `use-fetch.ts` (feature-flag query decoration; S) and `feature-flags-context.tsx`; its `.env` is untracked (`L/mc-view-app/.env` exists locally but is not in `git ls-files`) - never copy it.

## Glossary

- **App Kit / `@commercetools-frontend/*`**: the Merchant Center customization toolkit. All packages release in lockstep and must share one version.
- **Custom Application**: standalone MC app with its own menu entry (`mc-app`, `composed-apps`). **Custom View**: embedded `CustomPanel` on built-in MC pages (`mc-view-app`).
- **forward-to / `/proxy/forward-to`**: Merchant Center API gateway endpoint that authenticates the MC session and forwards the call to our service with a short-lived signed JWT (audience = forwarded URL).
- **audiencePolicy `forward-url-full-path`**: JWT audience is origin + path, so a token for one route cannot be replayed on another.
- **ADMIN_USER_IDS**: service allowlist of administrator Merchant Center user ids (comma-separated, service config, change B/C/D); membership of the gateway-JWT `sub` makes a user an admin.
- **Your user ID line**: a small read-only text line (with a copy button) that shows the bootstrap `userId`, so an operator can put it into `ADMIN_USER_IDS` (UI in P and S).
- **`${env:NAME}` placeholder**: substituted by the config loader from `process.env` at `compile-html`/`build`; Connect injects values from `connect.yaml` configuration.
- **Session gate**: React tree (`AuthProvider` + `ConnectProvider`) that renders children only after the bootstrap succeeded.
- **Drift guard**: `scripts/check-duplicates.mjs`, fails when intentional file copies differ.

## Source map

| Legacy (under `L/mc-app/` unless noted) | New | Verdict | Owner |
|---|---|---|---|
| `package.json` | `mc-app/package.json` | CHANGE (name `@commercetools-labs/ai-assistant-mc-app`, prune unused deps, declare `@commercetools-frontend/sdk`, drop `extract-intl`/`test` echo keep `test` only if B/V require, SPDX N/A for JSON) | O |
| `yarn.lock` | `mc-app/yarn.lock` | CHANGE (regenerate) | O |
| `.nvmrc .prettierrc .prettierignore .gitignore jest.*.config.js jest.d.ts jest-runner-eslint.config.js @types-extensions/ tsconfig.json` | same names | KEEP (jest.test.config.js, jest.d.ts: KEEP only if a test script remains, else DROP) | O |
| `.eslintrc.js` | `mc-app/.eslintrc.js` | CHANGE (drop `@graphql-eslint` override tied to missing schema unless P adds `.ctp.graphql` lint) | O |
| `.env.example` | `mc-app/.env.example` | CHANGE (neutral values) | O |
| `custom-application-config.mjs` | `mc-app/custom-application-config.mjs` | CHANGE (name, CSP, scopes) | O |
| `intl-formatter.js` | - | DROP | O |
| `README.md` (starter) | `mc-app/README.md` | CHANGE (W rewrites) | W |
| `public/` | - | DROP (build output, ignored) | O |
| `scripts/generate-nimbus-surface.mjs` | `mc-app/scripts/generate-nimbus-surface.mjs` | CHANGE (drop router sibling path, add `--out`) | O |
| `src/index.tsx`, `src/components/entry-point.tsx`, `src/load-messages.ts` | same | KEEP (+SPDX, `console.warn` -> silent fallback) | O |
| `src/constants.ts` | `mc-app/src/constants.ts` | CHANGE (no permission groups; keep `PERMISSIONS` default pair, keep `SHARED_COMPOSED_PAGES_CONTAINER_KEY` for M, comments neutral) | O |
| `src/routes.tsx` | `mc-app/src/routes.tsx` | CHANGE (O: skeleton with `NimbusProvider` + `AllProviders` + placeholder; P adds chat route; Q adds guarded routes) | O/P/Q |
| `src/contexts/index.tsx`, `auth.tsx`, `connect.tsx` | same | CHANGE (single-project bootstrap; connect gate keeps only reauth state; Q adds identity gates) | O |
| `src/contexts/session.tsx` | - | see P | P |
| `src/contexts/{backoffice-context,mcp-config,system-prompt-config}.tsx` | - | see Q | Q |
| `src/contexts/{tool-call-logs-config,tabbed-header-context,compose-preview-context,composed-page-context,composed-pages-context,data-sources-context}.tsx` | - | see P | P |
| `src/hooks/use-mc-session/` | `mc-app/src/hooks/use-mc-session/` | CHANGE (new response shape; no `userEmail`, no `sessionId` body, no `workspace`) | O |
| `src/hooks/use-chat-service-endpoint/` | same | KEEP | O |
| `src/hooks/use-assistant-admin/` | same | CHANGE (reads only the bootstrap `isAdmin`; no `useIsAuthorized`) | O |
| `src/hooks/use-current-user.ts` | same | KEEP (display only: greeting, avatar) | O |
| `src/hooks/use-mc-teams/` (+ 2 `.administration.graphql`) | - | DROP (tenancy / teams) | O |
| `src/hooks/use-graphql/` | `mc-app/src/hooks/use-graphql/` | KEEP -> see P (composed pages) | P |
| `src/hooks/use-chat-service-connector/`, `use-next-prompts.ts`, `use-suggestions.ts` | - | see P | P |
| `src/hooks/use-managed-mcp/` | - | see Q | Q |
| `src/hooks/use-composed-pages-connector/`, `use-composed-pages-storage/` | - | see P | P |
| `src/components/reauthenticate-dialog/` | same | KEEP | O |
| `src/components/{new-chat,shell,panels/chats-drawer,panels/composed-page-panel,interactive-tab-content,code-preview,compose-preview,preview-annotations,composed-page-view,composed-page-chart,page-renderer,ui-error-boundary}` | - | see P | P |
| `src/components/{managed-mcp,configuration,configure-mcp,panels/settings-drawer,backoffice}` | - | see Q | Q |
| `src/i18n/data/{en,de}.json`, `core.json` | `mc-app/src/i18n/data/en.json` | CHANGE (keep `{}` en only per Q15; drop de + core.json; `load-messages.ts` single branch) | O |
| `src/motion/` | - | see P | P |
| `src/test-utils/` | - | DROP | O |
| `src/helpers.ts`, `src/types.ts`, `src/types/generated/ctp.ts`, `src/graphql.d.ts` | - | DROP (graphql.d.ts: KEEP only if `.graphql` imports remain, decided in P) | O/P |
| `src/types/{chart,composed-page}.ts` | - | see P | P |
| `src/utils/forward-to.ts` | `mc-app/src/utils/forward-to.ts` | KEEP (verbatim + SPDX) | O |
| `src/utils/{session-storage,tool-call,feedback-payload,gravatar,relative-time,material-icons,schema-helpers,babel-renderer,nimbus-surface.generated}.ts(x)` | - | see P | P |
| `src/utils/mc-api-error.ts` | - | see Q | Q |
| `L/composed-apps/{package.json,custom-application-config.mjs,.env.example,tooling files}` | `composed-apps/...` | CHANGE (bump 25.1.0 -> 27.9.6; same tooling) | O |
| `L/composed-apps/src/**` | `composed-apps/src/**` | see R (O only adds `utils/forward-to.ts` + SPDX policy) | R |
| `L/mc-view-app/{package.json,custom-view-config.mjs,.env.example,tooling files,src/constants.ts}` | `mc-view-app/...` | CHANGE (neutral name, CSP, `locators` reduced to ONE placeholder; S restores 65) | O/S |
| `L/mc-view-app/src/**` | `mc-view-app/src/**` | see S (O only adds `utils/forward-to.ts`) | S |
| `L/connect.yaml`, `L/netlify.toml`, `L/yarn.lock` (root stub), `L/.connect/` | - | DROP here (connect.yaml is B's; others never copied) | B/O |
| `L/FEATURES.md`, `L/README.md` | - | DROP (W regenerates) | W |

## Decisions

**D-O1. One App Kit version: 27.9.6 everywhere.** Matches the plan (D7) and mc-app. Alternatives: newest published version (risk: Nimbus 3.5 / `@chakra-ui` / theme typegen compatibility never tested together); keep three lines (rejected: lockstep requirement in the skill). composed-apps jumps 25.1 -> 27.9.6, so its build is re-verified in this change.

**D-O2. yarn 1 per folder, committed `yarn.lock`, no root manifest.** Per skill (`monorepo-with-storefront.md`) and Connect docs (lockfile must be pushed). Alternative npm: breaks existing `postinstall` yarn calls and lockfiles; rejected. Open: see Q-O3 about Connect's actual install command for MC apps.

**D-O3. Env contract.** mc-app and composed-apps: `CUSTOM_APPLICATION_ID`, `ENTRY_POINT_URI_PATH`, `CLOUD_IDENTIFIER` (default `gcp-us` in connect.yaml, B), `CHAT_SERVICE_ENDPOINT_URL`. mc-view-app: `CUSTOM_VIEW_ID`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`. `APPLICATION_URL` is injected by Connect (not declared in connect.yaml) and appears only in `.env.example` for local builds. `INITIAL_PROJECT_KEY` is dev-only: stays in `.env.example`, never in connect.yaml. `CHAT_SERVICE_ENDPOINT_URL` is a phase-2 value (D8): service deploys first, URL pasted into the frontends' deployment configuration. Alternative: derive from a relative URL - rejected, MC apps are hosted on a different origin than the service.

**D-O4. CSP minimum.** `connect-src: ['*.commercetools.app','*.gstatic.com']`; `script-src: ['*.commercetools.app','*.gstatic.com',"'unsafe-inline'", "'unsafe-eval'" (apps with babel-renderer only)]`; `img-src` keeps gravatar for the avatar (mc-app, view); fonts/style `*.gstatic.com`. Removed: ngrok, localhost:8080, `*.run.app`. mc-view-app drops `'unsafe-eval'` (it has no generated-code renderer). If a Chrome run shows a CSP violation, add only the specific host. Alternative: keep legacy list "just in case" - rejected (hygiene; it names infra).

**D-O5. Scope decision.** mc-app keeps the legacy `oAuthScopes` minus `view_api_clients`/`manage_api_clients` (the API-client minting hook no longer exists and Managed MCP now uses identity mode) because generated pages run arbitrary GraphQL (queries and `mutation` actions exist in `types/composed-page.ts`). `view_mcp_servers` is listed under `view` and `manage_mcp_servers` under `manage` of the app's normal `oAuthScopes` (they used to ride on the removed permission group; listing and creating servers uses the user's own MC permissions through `/proxy/ctp`, while the service still requires admin for the binding). composed-apps keeps its legacy list. mc-view-app keeps `view_key_value_documents`/`manage_key_value_documents` and adds `view_mcp_servers`/`manage_mcp_servers` the same way if S's Managed MCP surface needs them (S decides; default: only what the view uses). Alternative: strip to the strict minimum - deferred as Q-O2.

**D-O6. Admin model (replaces the permission-group model; owner decision 2026-10-09).** Admin = the user's Merchant Center user id (the verified gateway-JWT `sub`) is in the service allowlist `ADMIN_USER_IDS`; the SERVICE decides (change D) and answers `isAdmin: boolean` in `POST /auth/session`. REMOVED: the extra permission group, `PERMISSION_GROUPS`, the generated admin permission key, `useIsAuthorized`-based admin check, `includeUserPermissions` / `X-Forward-To-Claims`, `additionalOAuthScopes`. `useIsAssistantAdmin()` (name kept) reads ONLY the bootstrap `isAdmin` (never an MC permission, localStorage or header). UI gating is UX only; every admin route is `requireAdmin` on the service (403 `ADMIN_REQUIRED`). An empty `ADMIN_USER_IDS` means nobody is admin. The Custom Application keeps only its default View/Manage pair, which controls opening the app and the MC GraphQL proxy.

**D-O7. Auth bootstrap shape.** `POST auth/session` with empty JSON body `{}` (no `userEmail`, no `sessionId`) -> `{success, data:{projectKey,userId,identityMcpConfigured,isAdmin}}`. `userEmail` is never sent and, if ever received, never read. The legacy `workspace` prefetch (session + messages + sessions + digest in one response) is dropped from the foundation; if P's measurements show a slow first paint, G may re-add it as an optional field (open question Q-O4). Contributors in D/G/I may add optional fields (`identityUserConnected` from I, `toolCallLogs` and `workspace` from G. See `d-mc-session-auth/specs/mc-session-bootstrap`). The type therefore declares `identityUserConnected?: boolean` and `toolCallLogs?: ToolCallLogsMode` as optional and `AuthProvider` exposes them; `isAdmin` is required (`false` when absent, fail closed), and `userId` is required and exposed by `useAuth()`. Q falls back to `GET managed-mcp-identity/status` when `identityUserConnected` is undefined, P falls back to `GET tool-call-logs` when `toolCallLogs` is undefined. `workspace` is ignored. Alternative: keep the workspace optimisation - rejected for now: it couples O to G's data model and was added for multitenant latency.

**D-O8. Session gate layering.** O ships `ConnectProvider` with two states (reauth dialog, ready). Q extends the same file with the identity gates (`!identityMcpConfigured` -> binding page; not connected -> connect gate) so the dependency order O -> P -> Q holds and P can be tested without Q (P runs with `identityMcpConfigured=false` accepted; chat then reports "no commercetools tools"). Alternative: put all gates in O with stub pages - rejected, would duplicate Q's work.

**D-O8b. The bootstrap exposes the caller's own `userId`.** `useAuth()` returns `userId` (already part of the bootstrap) so that P (mc-app Settings > About) and S (mc-view-app panel footer) can render the read-only "Your user ID" line; this is how an operator learns the value to put into `ADMIN_USER_IDS`. O only guarantees the field is present, typed and non-optional; the UI belongs to P and S. composed-apps has no admin UI and no line.

**D-O9. Duplicate-drift script.** `scripts/check-duplicates.mjs` holds a manifest `[{ files: [mc-app/..., composed-apps/..., mc-view-app/...] }]`; byte comparison, exit 1 on difference. v1 manifest: `forward-to.ts` only. R and S append `schema-helpers.ts` / `babel-renderer.tsx` when they confirm those must stay identical (legacy copies already drifted). Alternative: shared folder with relative imports - impossible because each app is built independently by Connect from its own folder (skill rule), so a file outside the folder is not in the build context.

**D-O10. Dependency pruning.** Remove only packages with zero imports AND not required as App Kit peers, one by one with `yarn typecheck && yarn build` after each (tasks 3.x). Candidates: `slate*`, `formik`, `moment`, `msw`, `zod`, `react-markdown`, `omit-empty-es`, `@commercetools/sync-actions`, `@commercetools/composable-commerce-test-data`, `graphql-tag` (P may need it for `.graphql` loader: decided in P), `@babel/core`. Keep `redux`, `react-redux`, `@emotion/*` (App Kit peers, in `resolutions`). Alternative: keep everything - rejected, larger install and audit surface.

**D-O11. Unit tests only for `useIsAssistantAdmin` and the `userId` exposure.** Legacy has none (FEATURES.md). Gates are typecheck, lint, build, the Chrome scenarios and, in mc-app only, `yarn test` for `useIsAssistantAdmin` (fail-closed flag is security-relevant and cheap to unit-test). composed-apps and mc-view-app have no `test` script unless B's `connect validate` needs one (then `"test": "echo \"no unit tests\" && exit 0"`).

## Risks / Trade-offs

- **composed-apps 25.1 -> 27.9.6 upgrade** may break typings/imports in code R ports. Mitigation: O only makes the foundation build with a stub route; R fixes its own source.
- **Connect build tooling for MC apps** may use npm, not yarn (skill vs docs). Mitigation: Q-O3; the postinstall chain must also work with `npm install` (no yarn-only syntax in scripts other than `yarn` calls we replace by `npm run`). Task 3.4 rewrites postinstall to `npm run`-compatible form.
- **postinstall runs `chakra typegen`** (needs devDependencies); a production-only install would skip it. Keep all in `dependencies` as legacy does.
- **Stale admin UI state**: the browser could show or hide admin UI wrongly after the operator changes `ADMIN_USER_IDS`. Mitigation: the flag is re-read on every bootstrap (refresh the page); the service re-checks every request, so a wrong UI never grants anything. E2E-O-03 asserts `isAdmin` for the admin user and the non-admin user.
- **Popup blockers / lost message**: Mitigation: open the popup from the click handler, 10-minute timeout, visible retry; messages are accepted only from the popup window with the expected origin and state.
- **Dropping `userEmail`** breaks compatibility with any service route that still requires it. Mitigation: G's contract; P's connector task documents the switch; interim shim not provided.
- **CSP too tight** shows up only in a real MC page. Mitigation: E2E-O-04 console check.
- **Nimbus surface script** requires jsdom and network-free import of Nimbus; failure breaks `yarn install`. Mitigation: task 12 makes the postinstall step fail soft with a clear message only for `--check`, hard for generation.

## Open questions

- **Q-O1**: REMOVED (2026-10-09): no permission key exists any more; the admin model is `ADMIN_USER_IDS`-based (see `plans/owner-questions.md`).
- **Q-O2**: trim `oAuthScopes` of mc-app/composed-apps to what generated pages need? Default: keep legacy list minus api-client scopes, plus `view_mcp_servers`/`manage_mcp_servers` in view/manage.
- **Q-O3**: does Connect build MC apps with yarn (lockfile) or npm? Default: yarn.lock committed; scripts must work with both. Verify on first sandbox deploy (U).
- **Q-O4**: re-add the bootstrap `workspace` prefetch for first-paint speed? Default: no.
- **Q-O5**: Custom View `connect.yaml` keys (skill: `CUSTOM_VIEW_ID` + `CLOUD_IDENTIFIER`; the doc example also lists `ENTRY_POINT_URI_PATH`). Default: skill. Owner of the answer: B/U via `commercetools connect validate`.
- Plan items: see `plans/questions-inbox/OPQ-questions.md`.

## Changelog

- 2026-10-09: Replaced the `assistant-admin` permission-group model (PERMISSION_GROUPS, `includeUserPermissions`, `additionalOAuthScopes`, claim-key capture, Q-O1) by the service-decided `ADMIN_USER_IDS` admin model (owner decision): bootstrap carries `userId` and `isAdmin`, `useIsAssistantAdmin` reads only `isAdmin`, MCP scopes moved into the apps' normal `oAuthScopes`, the bootstrap exposes `userId` for the "Your user ID" line (P, S). Test users are an admin user (id in `ADMIN_USER_IDS`) and a non-admin user. Tasks 6.9-6.11 and E2E-O-06 rewritten.
