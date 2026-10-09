## Context

Change S (`s-mc-view-app`), needs O and P. Legacy root `L/` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/`; router root `RT/` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/`. Read `plans/00-overview.md`, `plans/01-source-inventory.md` section 3 and `plans/02-target-architecture.md` first.

## Explore findings

1. **Registration.** `L/mc-view-app/custom-view-config.mjs`: `type: 'CustomPanel'`, `typeSettings.size: 'SMALL'`, name "AI Assistant", `env.production.{customViewId,url}` placeholders, a legacy `additionalOAuthScopes` for an extra permission group (REMOVED in the target), 65 locators (counted: 65 entries; products 14, customers 17, remaining across categories, discounts, operations, orders, settings, standalone_prices). legacy `oAuthScopes` was only `view_key_value_documents` / `manage_key_value_documents` and the comment says they are unused (every call moved behind `/proxy/forward-to`; "must stay non-empty").
2. **Hard-coded dev values.** `env.development.hostUriPath: '/us-store/products/e3c6af62-c812-4d01-bcfb-08574c2f84ae'` (a real project path and product id) and `.env.example`/`.env` contain `INITIAL_PROJECT_KEY=multiplatform-us-store` and an ngrok `CHAT_SERVICE_ENDPOINT_URL`. CSP `script-src` lists ngrok, localhost:8080 and three `*.run.app` regions although the comment says the browser never contacts the router directly. All must go (labs publication gate, change X).
3. **Legacy permission group.** `L/mc-view-app/src/constants.ts` registered a single extra group carrying `manage: ['manage_mcp_servers']` (FEATURES.md still says nine groups; stale) and documented that an unprefixed group name collided with MC administration and broke token requests with `invalid_scope: Permissions exceeded`. Nothing in the view checked it. Decision 2026-10-09: the group is REMOVED (admin is decided by the service, O D-O6); its two scopes move into `oAuthScopes`, so the collision risk disappears.
4. **Feature flag.** `src/contexts/feature-flags-context.tsx`: `useState({ customView: btoa(hostUrl) })` where `hostUrl` comes from `useCustomViewContext`. `btoa` throws `InvalidCharacterError` for characters outside Latin-1 - a host URL with an encoded-then-decoded unicode segment would crash the provider. `src/hooks/use-fetch.ts` appends every flag with `URLSearchParams.append` to the URL and calls `forwardToFetch`; the comment states the router's `featureFlagsMiddleware` persists `featureFlags.customView` on the session and the orchestrator then selects `custom-view.agent.ts`; dropping the flag "silently turns this surface into a plain chat" (`RT/FEATURES.md` lines ~226-231, 449-452: flags are any non-reserved query param; session lookups filter on `featureFlags.{key} == value`, so requests without flags only see flag-free sessions).
5. **Implication for session scoping.** Because the flag value is the base64 of the whole host URL, a conversation is scoped to **one host page URL** (each product, order, ... has its own session). This is legacy behaviour, probably intended ("chat about this entity"), but it means the "recent chats" list in the panel is per page. Recorded as RQ6 for the owner; default keep.
6. **Bootstrap.** `src/hooks/use-mc-session/index.ts` POSTs `/auth/session?userEmail=...` through `useFetch` (flag-aware, load-bearing) with the remembered `sessionId` (target: no `userEmail`, never sent); the router answers `{projectKey,userId,managedMcpConfigured,identityMcpConfigured,toolCallLogs,workspace:{session,messages,sessions}}`. Target contract (plan 01, amended 2026-10-09): `{projectKey,userId,identityMcpConfigured,isAdmin}` and no `managedMcpConfigured`/`permissions`; whether `workspace` and `toolCallLogs` survive is decided by change G - the view must read whatever G publishes in `docs/api.md` and keep its own fallback fetches (the file says "every consumer keeps its own fetch as the fallback").
7. **Gate.** `src/contexts/connect.tsx` (142 lines): spinner -> error text -> "not connected to an identity-mode Managed MCP Server yet. Open the AI Assistant application to set one up." when `!managedMcpConfigured || !identityMcpConfigured` -> status fetch -> `IdentityMcpConnectGate` ("Connect my account"). Errors render as plain red text only (no retry button, unlike mc-app's re-authentication dialog). `src/hooks/use-identity-mcp/index.ts` runs the identity OAuth through a popup with a 10-minute timeout; popups from an iframe-hosted Custom View can be blocked (risk R3).
8. **Surface diff vs mc-app** (measured with `diff` on `L/mc-view-app/src/components/new-chat` vs `L/mc-app/src/components/new-chat`): identical: `parts/json-block.tsx`, `parts/text-part.tsx`, `parts/visualization/{index.tsx,types.ts}`, `types.ts`, `typing-indicator/{index.tsx,use-typewriter.ts}`, `utils/forward-to.ts`, `utils/gravatar.ts`. Diverged (diff lines): `chat-area.tsx` 502, `index.tsx` 174, `message.tsx` 89, `parts/export-part.tsx` 102, `parts/file-part.tsx` 75, `parts/source-part.tsx` 51, `parts/subagent-part.tsx` 62, `chart-renderer.tsx` 108, `visualization-part.tsx` 132, `cute-text-*` 36/13, minor others. View-only files: `empty-state.tsx`, `input-area.tsx`, `file-attachment.tsx`, `parts/tool-part.tsx`. mc-app has since moved to `composer/`, `shell/`, `tool-steps/` (FEATURES.md sections "Chat surface"). So the view fork is an older generation of the chat.
9. **Dependencies.** `package.json`: `@ai-sdk/react ^4.0.95`, `ai 7.0.92`, `@commercetools-frontend/mc-scripts 27.9.6`, `@commercetools/nimbus ^3.5.1` (already on the target version line; FEATURES.md saying 26.1 is stale).
10. **Hygiene.** `console.*` counts in src: `use-chat-service-connector.ts` 20, `session.tsx` 10, `chat-area.tsx` 3, `session-storage.ts` 3, `tool-call-logs-config.tsx` 2, others 1. Starter leftovers `helpers.ts`, `types.ts`, `types/generated/*`, `graphql.d.ts`, `intl-formatter.js`. `public/` is present locally (ignored? verify `.gitignore`).
11. **Connect rules.** `commercetools-connect` skill `references/merchant-center-customizations.md` Pattern 1/2: a custom view uses `applicationType: merchant-center-custom-view`, config keys `CUSTOM_VIEW_ID` and `CLOUD_IDENTIFIER`, no entry-point path; register the view with a placeholder URL first (manual step M7), then deploy, then update the URL. `mc-scripts start` renders the view inside a host dummy app at `http://localhost:3001` using `env.development.hostUriPath`.
12. **Build isolation.** `mc-scripts` babel/ts loaders `include: sourceFolders` only (`node_modules/@commercetools-frontend/mc-scripts/dist/create-webpack-config-for-production-*.esm.js` lines 370/400/481), so a sibling `shared/` folder is not transpiled; consistent with plan 02 (copy + drift guard).

## Glossary

- **Custom View / CustomPanel**: Merchant Center extension that renders an app in an iframe panel on built-in pages; declares `locators` (where it may appear) and a panel size.
- **Locator**: identifier of a built-in page position, e.g. `products.product_details.general`.
- **Host URL (`hostUrl`)**: URL of the built-in page that hosts the panel; provided by `useCustomViewContext`.
- **Feature flag `customView`**: base64 of the host URL, sent as query parameter; the service scopes sessions on it and selects the custom-view agent.
- **forward-to**: Merchant Center API gateway that forwards a browser request to the service with a short-lived signed JWT.
- **Identity MCP / Connect my account**: per-user OAuth connection to the commercetools Managed MCP Server (change I).
- **Read-only binding gate**: the panel reads whether the project has a binding but cannot create one.
- **Drift guard**: `scripts/check-duplicates.mjs` that fails when duplicated files differ.

## Source map

| Legacy file (`L/mc-view-app/`) | New file (`mc-view-app/`) | Verdict |
|---|---|---|
| `custom-view-config.mjs` | same | CHANGE (placeholders, CSP, `hostUriPath` from env, keep 65 locators) |
| `src/constants.ts` | same | KEEP (prefix rule) |
| `package.json`, tsconfig, eslint/prettier/jest configs, `.nvmrc` | same | CHANGE (versions from O) |
| `src/index.tsx`, `components/entry-point/*`, `load-messages.ts`, `routes.tsx` | same | KEEP |
| `src/contexts/feature-flags-context.tsx`, `hooks/use-fetch.ts` | same | CHANGE (UTF-8-safe encode, flag-name constant, pure URL builder) |
| `src/contexts/auth.tsx`, `hooks/use-mc-session/index.ts` | same | CHANGE (new bootstrap contract, 401 vs other error codes) |
| `src/contexts/connect.tsx`, `components/identity-mcp-connect-gate.tsx`, `hooks/use-identity-mcp/*` | same | CHANGE (retry actions, error states) |
| `src/contexts/session.tsx`, `tool-call-logs-config.tsx`, `utils/session-storage.ts` | same | CHANGE (remove console, contract from G) |
| `src/hooks/use-chat-service-connector/*` | same | CHANGE (drop unused methods; REST contract from G) |
| `src/components/new-chat/**` | same | CHANGE (re-derived from mc-app, D1) |
| `src/components/error-boundary.tsx`, `utils/gravatar.ts`, `utils/tool-call.ts` | same | KEEP |
| `src/utils/forward-to.ts` | same | KEEP (drift guarded) |
| `src/hooks/use-chat-service-endpoint` | same | KEEP |
| `src/types/generated/*`, `helpers.ts`, `types.ts`, `graphql.d.ts`, `intl-formatter.js`, `.env`, `public/` | - | DROP |

## Decisions

**D1. Chat components: copy from finished `mc-app` (P) and prune, do not port the legacy fork.** Alternatives: (a) port `L/mc-view-app/src/components/new-chat` as-is - rejected: an older generation that already differs by hundreds of lines from mc-app, so users would see two different chats and bug fixes in P would never reach the panel; (b) shared folder - rejected (finding 12: not transpiled, no workspace); (c) npm package published from this repo - rejected: release overhead; (d) copy + prune + guard - chosen. The pruning list: tool menu (`server-tools`), `feedback-popup`, `floating actions`, `view-switcher`/preview/code, `left-panels`, `app-rail`, configuration, backoffice, composed-page parts (`gen-ui-part`), tool-icon components not used by `tool-part`. Guarded files (byte-identical after prettier): `parts/json-block.tsx`, `parts/text-part.tsx`, `parts/visualization/*` if unchanged by P, `typing-indicator/*`, `types.ts`, `utils/forward-to.ts`, `utils/gravatar.ts`, `utils/tool-call.ts`, `utils/schema-helpers.ts` is NOT needed here. Files that must differ (composer wrapper, `chat-area.tsx`, `index.tsx`) are not guarded; their header comment says "derived from mc-app/<path> at commit <sha>".

**D2. Surface scope = chat only** (as legacy). Anything requiring admin or wide screens stays in mc-app. Alternative: embed the tool menu - rejected, SMALL panel width.

**D3. Feature flag encoding.** Replace `btoa(hostUrl)` by a helper `encodeHostUrl(url)` = base64 of the UTF-8 bytes (`btoa(String.fromCharCode(...new TextEncoder().encode(url)))`). The service decodes with `Buffer.from(x,'base64').toString('utf8')` (verify in change H; legacy decode uses base64 on the router side). The base64 value is appended via `URLSearchParams`, which percent-encodes `+/=`. Alternative: base64url - rejected to avoid a service change.

**D4. Single source for "which fetch".** All service calls (including the AI SDK transport and the bootstrap) use `useFetch()`; direct use of `forwardToFetch` outside `useFetch` and `use-identity-mcp` is forbidden by a unit test that greps the source (cheap guard against the regression described in the legacy comment). Identity endpoints live outside the feature-flag scoping (they are per user, not per page) and keep calling `forwardToFetch` directly.

**D5. Gate UX.** Port mc-app's re-authentication dialog pattern from P only if it is a small, pure component; otherwise render Nimbus `Alert` with Retry/Sign in again buttons. Either way: 401 -> "Your Merchant Center session has expired" + "Sign in again" (`/logout?reason=unauthorized`) + Retry; 403 -> "This project is not served by the configured AI Assistant"; others -> message + Retry.

**D6. Development host path.** `env.development.hostUriPath: '${env:HOST_URI_PATH}'` with `.env.example` default `/your-project-key/products/your-product-id`. Verify placeholder substitution works for this field in `mc-scripts start` (task 2.2 spike); fallback is a clearly fake literal path.

**D7. Scopes instead of a permission group.** No `additionalOAuthScopes`, no permission group. `oAuthScopes`: `view`: `view_key_value_documents`, `view_mcp_servers`; `manage`: `manage_key_value_documents`, `manage_mcp_servers` (the two MCP scopes moved here from the REMOVED group, parity with mc-app O D-O5; the panel itself never lists, creates or binds servers). The view has no admin check and no admin UI: admin status is decided only by the service (`ADMIN_USER_IDS`) and the panel ignores `isAdmin`; it reads only `userId`, to show the read-only "Your user ID" line (D9). Alternative: drop the two MCP scopes - possible if the Custom View registration accepts only key-value scopes; decide with the owner at registration time (M7).

**D8. userEmail parameter.** Decided 2026-10-09: `userEmail` is never sent and, if the service ever saw it, it is ignored (ownership is the verified `userId`; the only trusted e-mail is the one from the user's own commercetools Identity sign-in, which never reaches the browser). It is removed from the `NewChat` URL, bootstrap and connector (task 4.2). A display-only `userLabel` is not sent either: the view creates sessions with the title only.
**D9. "Your user ID" in the panel footer.** Admin is `ADMIN_USER_IDS` membership, so a user who opens the view first needs a place to read their own id. The panel footer shows P's `YourUserId` component (compact variant, copied byte-identically from mc-app and registered in the drift guard) fed by the bootstrap `userId`; it is read-only, takes a few lines of layout, and is optional if the panel space is too tight (then the README points to mc-app Settings > About). It does not make the panel read `isAdmin`.

## Risks / Trade-offs

- **R1 Drift from mc-app chat** - guarded files only; unguarded copies can diverge. Mitigation: header with source commit + quarterly diff note in README maintenance section.
- **R2 Per-page sessions** (finding 5) may surprise users - RQ6.
- **R3 Identity popup inside iframe**: browsers may block popups from a sandboxed iframe or Safari ITP may block storage. Mitigation: error text + retry; E2E-S-06 verifies in Chrome; document fallback "connect from the AI Assistant application once".
- **R4 Locator validity**: a locator accepted at dev time may be rejected at registration if MC renames it; build is the only check. Mitigation: documented in README, E2E on 3 representative pages.
- **R5 Host URL contains project key and entity id** and is stored in the session's feature flags and in logs. Not secret, but it is a Custom Object value (change E) and appears in service logs; documented in `docs/troubleshooting.md`.
- **R6 CSP `unsafe-eval`/`unsafe-inline`**: legacy list includes both; check whether the view still needs them (no composed-page renderer here). Drop `'unsafe-eval'` if the build and Chrome scenarios pass without it; keep `'unsafe-inline'` only if the shell requires it (task 3.1 decides empirically).
- **R7 5-minute stream ceiling** applies; the panel must render the graceful-finish message from H.

## Open questions

- RQ6 (owner, mirrored in `plans/questions-inbox/RSTVWZ-questions.md`): is per-host-URL session scoping desired, or should one conversation per project/user follow the user across pages (flag = entity type only)? Default keep (scoped per URL).
- RQ7 (owner): should the view also be shipped with locators for Stores/Channels settings pages (already included) - default keep all 65.
- To verify during implementation: `custom-view-config` `${env:...}` substitution for `hostUriPath`; the exact wire shape of `/auth/session` from change G; whether `view_key_value_documents` is still required for registration ("view must stay non-empty").

## Changelog

- 2026-10-09 (owner decision Q9): the copied `parts/file-part.tsx` and the new `hooks/use-service-image.ts` (from change P) load private images (`/files/...` paths) with `forwardToFetch` into a blob URL, revoked on unmount; both are added to the drift guard (task 9.1).
- 2026-10-09: Owner decision on the admin model (`ADMIN_USER_IDS`, service-decided, no permission groups): the legacy permission group is removed, `view_mcp_servers`/`manage_mcp_servers` move into `oAuthScopes` (D7), the bootstrap type uses `isAdmin` (ignored by the panel) and `userId`, `userEmail` is never sent (D8), the unbound-project gate tells users that an administrator must connect the Managed MCP Server, the panel footer shows a read-only "Your user ID" line (D9, task 4.4, E2E-S-12), and E2E-S-04/05 use the non-admin user and the admin user.
