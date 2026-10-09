## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings 1-12, Decisions D1-D8) and `specs/mc-view-app/spec.md`.
- [x] 0.2 Read `plans/00-overview.md`, `plans/02-target-architecture.md`, `plans/04-workflow.md` sections 3-5.
- [x] 0.3 Read the results of changes O (foundation), P (mc-app chat surface; you will copy from it), G (`docs/api.md` REST contract: `/auth/session`, session routes; `userEmail` is never sent), I (identity endpoints `managed-mcp-identity`). (not needed: verified from code and tests)
- [x] 0.4 Read the legacy sources: `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-view-app/custom-view-config.mjs`, `src/contexts/{feature-flags-context,connect,session}.tsx`, `src/hooks/use-fetch.ts`, `src/hooks/use-mc-session/index.ts`, `src/components/new-chat/index.tsx`.
- [x] 0.5 Read https://docs.commercetools.com/merchant-center-customizations/tooling-and-configuration/custom-view-config.md and https://docs.commercetools.com/merchant-center-customizations/custom-views.md. (not needed: verified from code and tests)

You should now be able to explain: (a) what a locator is and why there are 65, (b) what the `customView` flag does on the service, (c) why the panel cannot create an MCP binding, (d) why chat files are copied from mc-app and which are guarded.

## 1. Setup

- [x] 1.1 Branch and prerequisites.
  **Why:** isolate work; fail early.
  **Where:** `/Users/behnam/code/commercetools-labs/ai-assistant`.
  **How:** `git switch -c spec/s-mc-view-app`; `node -v` is `v22.x`; `ls scripts/check-duplicates.mjs mc-app/src/components/new-chat` succeeds; `grep -n "auth/session" docs/api.md openspec/specs -r | head` shows the contract from change G.
  **Done when:** all succeed; otherwise a Needs change is missing - stop.
  **Watch out:** never write into the legacy repo.

## 2. Scaffold and registration config

- [x] 2.1 Copy tooling and set identity.
  **Why:** same toolchain as sibling apps.
  **Where:** `mc-view-app/{package.json,tsconfig.json,.eslintrc.js,.prettierrc,.nvmrc,.gitignore,jest*.js,jest.d.ts,@types-extensions/}` from `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-view-app/`.
  **How:** 1. copy (no `node_modules`, `public`, `.env`, `yarn.lock`, `intl-formatter.js`). 2. `"name": "@commercetools-labs/ai-assistant-mc-view-app"`, `"license": "MIT"`, `"private": true`. 3. versions from O (`@commercetools-frontend/*` 27.9.6; `ai` 7.0.92; `@ai-sdk/react ^4.0.95`). 4. scripts: remove `extract-intl`, `versions:appkit`; `"test": "jest --config jest.test.config.js"`. 5. `yarn install`.
  **Done when:** `yarn install` and the Nimbus `postinstall` typegen succeed.
  **Watch out:** no root workspace; Yarn 1.

- [x] 2.2 Write `custom-view-config.mjs` and `src/constants.ts`.
  **Why:** the registration contract (spec "Custom View registration contract", "Scopes without a permission group").
  **Where:** `mc-view-app/custom-view-config.mjs`, `mc-view-app/src/constants.ts`, `mc-view-app/.env.example`.
  **How:** 1. Copy the legacy config. 2. Replace `hostUriPath` by `'${env:HOST_URI_PATH}'` and add `HOST_URI_PATH=/your-project-key/products/your-product-id` to `.env.example`; spike: run `yarn start` and confirm the host page loads - if the placeholder is not substituted, use the literal fake path and document it in the README. 3. Remove `additionalEnv` ONLY if the app no longer reads it - it does (`chatServiceEndpointUrl`), so keep it. 4. Copy the 65 locators verbatim (do not reorder; keep the count). 5. CSP: `connect-src ['*.commercetools.app','*.gstatic.com']`, `script-src ['*.commercetools.app','*.gstatic.com',"'unsafe-inline'"]` (add `'unsafe-eval'` only if step 3.1 shows it is needed), `img-src` keep gravatar, `font-src`,`style-src` `*.gstatic.com`. 6. NO permission group and NO `additionalOAuthScopes` (REMOVED, design D7): delete `PERMISSION_GROUPS`; set `oAuthScopes` to `view: ['view_key_value_documents','view_mcp_servers']`, `manage: ['manage_key_value_documents','manage_mcp_servers']` with a comment per scope (key-value: must stay non-empty; MCP scopes: parity with mc-app, the panel never lists/binds servers). 7. `.env.example`: `APPLICATION_URL=https://example.invalid`, `INITIAL_PROJECT_KEY=your-project-key`, `CUSTOM_VIEW_ID=your-custom-view-id`, `CLOUD_IDENTIFIER=gcp-us`, `CHAT_SERVICE_ENDPOINT_URL=https://example.invalid/service`.
  **Done when:** `node -e "import('./custom-view-config.mjs').then(m=>console.log(m.default.locators.length))"` prints `65` (run from `mc-view-app/`) and `grep -nE "ngrok|run\.app|localhost|us-store|e3c6af62|multiplatform|additionalOAuthScopes|PERMISSION_GROUPS" custom-view-config.mjs .env.example src/constants.ts` prints nothing.
  **Watch out:** the config imports `./src/constants` (TypeScript) - works because mc-scripts loads `.mjs` configs through a TS-aware loader; do not convert `constants.ts` to JS.

- [x] 2.3 Entry point, routes, load-messages.
  **Why:** boot the view inside `CustomViewShell`.
  **Where:** `src/index.tsx`, `src/components/entry-point/*`, `src/routes.tsx`, `src/load-messages.ts`, `src/i18n/data/en.json`.
  **How:** copy; remove `console.warn` in load-messages; keep `NimbusProvider` with `loadFonts={false}` and router bridge.
  **Done when:** file compiles in `yarn typecheck` after later tasks.
  **Watch out:** the view runs in an iframe - `history.push` navigation reloads inside the iframe only.

## 3. Feature flags and fetch

- [x] 3.1 Feature-flag context with UTF-8-safe encoding.
  **Why:** spec "Embedded chat with entity context", design D3.
  **Where:** `src/utils/feature-flags.ts` (new pure helpers), `src/contexts/feature-flags-context.tsx`, `src/hooks/use-fetch.ts`; legacy copies in `.../mc-view-app/src/contexts/feature-flags-context.tsx` and `hooks/use-fetch.ts`.
  **How:** 1. In `feature-flags.ts` export `CUSTOM_VIEW_FLAG = 'customView'`, `encodeHostUrl(url: string): string` (UTF-8 bytes -> base64), and `applyFeatureFlagsToUrl(url, flags)` (moved from `use-fetch.ts`, keep the `new URL(url, window.location.origin)` + `searchParams.append` logic, skip `undefined`). 2. The provider uses `{ [CUSTOM_VIEW_FLAG]: encodeHostUrl(hostUrl) }`. 3. `use-fetch.ts` imports the helper. 4. Keep `useOptionalFeatureFlags`.
  **Done when:** unit tests in 8.1 pass.
  **Watch out:** `userEmail` and any other reserved query key must not be treated as a flag; only `customView` goes in the flags object.

- [x] 3.2 `forward-to.ts` and endpoint hook.
  **Why:** gateway transport.
  **Where:** `src/utils/forward-to.ts` (copy byte-for-byte from `mc-app/src/utils/forward-to.ts`), `src/hooks/use-chat-service-endpoint/index.ts`.
  **How:** `cp mc-app/src/utils/forward-to.ts mc-view-app/src/utils/forward-to.ts`; copy the endpoint hook from the legacy view.
  **Done when:** `node scripts/check-duplicates.mjs` exits 0 (after task 9.1 registers the group).
  **Watch out:** NEVER add a query string to the gateway URL (long comment in the file explains CORS preflight).

## 4. Bootstrap, auth and gates

- [x] 4.1 Session bootstrap hook and auth context.
  **Why:** align with the single-tenant contract; visible errors (spec "Bootstrap and authentication failures").
  **Where:** `src/hooks/use-mc-session/index.ts`, `src/contexts/auth.tsx`; legacy copies of the same path. Contract: `docs/api.md` from change G.
  **How:** 1. Copy. 2. Update the response type to the contract (`projectKey`, `userId`, `identityMcpConfigured`, `isAdmin`, plus any `workspace` fields G kept; the panel stores `isAdmin` but never reads it; it reads `userId` only for task 4.4). 3. Keep calling through `useFetch` (not `forwardToFetch`) so the flag applies. 4. Throw a typed `BootstrapError {status, message}`; keep `errorStatus` in context. 5. Remove `managedMcpConfigured` usages (single flag `identityMcpConfigured`). 6. Remove `console.*`.
  **Done when:** `yarn typecheck` passes for these files.
  **Watch out:** read `res.ok` before parsing JSON.

- [x] 4.2 Remove `userEmail` everywhere.
  **Why:** design D8 (decided 2026-10-09): identity is the verified `userId`; a browser e-mail is never sent.
  **Where:** `src/components/new-chat/index.tsx`, `src/hooks/use-mc-session/index.ts`, `src/hooks/use-chat-service-connector/*`, the `useCustomViewContext` selector.
  **How:** delete the `userEmail` query parameter from every URL (bootstrap, session calls, stream URL, digest, suggestions) and the selector that read the user's e-mail; session creation posts the title only (no `userLabel`).
  **Done when:** `grep -rn "userEmail\|userLabel\|@" mc-view-app/src` prints no e-mail handling (only unrelated `@`-imports).
  **Watch out:** `customView` must remain the only flag.

- [x] 4.3 Connect gate with retry and distinguishable errors.
  **Why:** spec "Read-only Managed MCP binding gate", "Per-user identity connect gate".
  **Where:** `src/contexts/connect.tsx`, `src/components/identity-mcp-connect-gate.tsx`, `src/hooks/use-identity-mcp/index.ts`, new `src/components/session-error.tsx`.
  **How:** 1. Copy legacy. 2. Compute a pure `deriveGateState({loading, error, errorStatus, identityMcpConfigured, identityConnected, statusError}) : 'loading' | 'unauthorized' | 'forbidden' | 'error' | 'no-binding' | 'connect' | 'ready'` in `src/contexts/gate-state.ts` and use it in `ConnectProvider`. 3. `session-error.tsx` renders messages per D5 with Nimbus `Button`s (Retry calls `auth.refresh()`). 4. Keep the no-binding instruction text exactly as in the spec ("... Ask an administrator to set one up in the AI Assistant application."); it is the same for admin and non-admin users and offers no control. 5. In `identity-mcp-connect-gate.tsx` keep popup flow; after an error set `busy=false` (already) and show the message.
  **Done when:** `gate-state.spec.ts` (8.1) passes; no `use-managed-mcp`/`create-api-client` files exist in `src`.
  **Watch out:** `onConnected` is in a `useEffect` dependency array - keep it stable (`useCallback`) or the status fetch loops.

- [x] 4.4 Add the "Your user ID" footer line.
  **Why:** spec "Own user id shown read-only"; operators need their id for `ADMIN_USER_IDS`.
  **Where:** `src/components/your-user-id/index.tsx` (copy of mc-app's component from change P task 6.7, compact variant) mounted in the panel footer below the composer.
  **How:** 1. Copy the file byte-identically and add it to the drift group in task 9.1. 2. Render it in the footer; it reads `userId` from the auth context and renders nothing when absent. 3. If the layout is too tight, render it inside the existing panel overflow menu instead and say so in the README.
  **Done when:** typecheck passes; `grep -n "input" src/components/your-user-id/index.tsx` prints nothing.
  **Watch out:** the panel must not read `isAdmin` for this; it is shown to everyone.

## 5. Chat surface (copy from mc-app, prune)

- [x] 5.1 Create the file list.
  **Why:** decide exactly what to copy before copying (design D1).
  **Where:** write the list as a comment block at the top of `mc-view-app/README.md` "Derived from mc-app" section.
  **How:** `ls -R mc-app/src/components/new-chat`; mark each file COPY / PRUNE. COPY: composer (message box with attach), `chat-area` (as the base), `message`, `parts/*` (text, reasoning, tool-steps or tool-part, subagent, source, file (with `hooks/use-service-image.ts`: images stored as `/files/...` paths load through `forwardToFetch` into a blob URL, owner decision Q9), export, visualization), `typing-indicator/*`, `empty-state`, avatars, `layout`, `types`. PRUNE: server-tools, feedback-popup, message-actions' feedback entry, view switcher, motion hooks only used by the shell, anything importing contexts that do not exist here.
  **Done when:** the list exists and every PRUNE item names the reason.
  **Watch out:** record the mc-app commit sha (`git rev-parse --short HEAD`) in the README.

- [x] 5.2 Copy the chat components.
  **Why:** one chat generation across surfaces.
  **Where:** `mc-view-app/src/components/new-chat/**`; sources `mc-app/src/components/new-chat/**`.
  **How:** `cp -R` the COPY files; delete unused imports; replace contexts with this app's (`useSession`, `useFeatureFlags`, `useToolCallLogsConfig`); keep `useChat` + `DefaultChatTransport({ fetch: useFetch() })`; remove `console.*`; add header `// Derived from mc-app/src/components/new-chat/<file> @ <sha>` where the file diverges.
  **Done when:** `yarn typecheck` passes for `components/new-chat`.
  **Watch out:** the `DefaultChatTransport` `api` URL already contains `?locale=` (and `userEmail` if kept); `useFetch` appends `customView` on top - do not add it twice.

- [x] 5.3 Session context and connector.
  **Why:** one open session per host page.
  **Where:** `src/contexts/session.tsx`, `src/contexts/tool-call-logs-config.tsx`, `src/hooks/use-chat-service-connector/*`, `src/utils/session-storage.ts`.
  **How:** copy legacy; delete unused connector methods (`grep -rn` each export; remove ones with no call site, e.g. tools editing); route types from `docs/api.md`; keep guards around `localStorage`; replace `console.*` with silent handling.
  **Done when:** `grep -rn "console\." mc-view-app/src` prints nothing.
  **Watch out:** the bootstrap may return the session and messages ("workspace"); if G removed it, fall back to `GET session` and `GET session/:id/messages` (already coded as the fallback in legacy `session.tsx` lines ~176-210).

## 6. Docs and hygiene

- [x] 6.1 Per-app README.
  **Why:** Connect certification artifact; change W links it.
  **Where:** `mc-view-app/README.md`.
  **How:** sections - What it is; Prerequisites (register the Custom View, M7); Configuration table (`CUSTOM_VIEW_ID`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`, `APPLICATION_URL` injected); Locators (list of 65 grouped by area); Scopes (no permission group; `view_key_value_documents`, `manage_key_value_documents` kept because the lists must be non-empty; `view_mcp_servers`, `manage_mcp_servers` for parity with mc-app; no admin UI in the panel); Fail-open/closed (service down -> error + retry, no chat); Local development (`HOST_URI_PATH`); Derived-from-mc-app note; Poison/replay: not applicable (no events/jobs); labs unsupported notice from A.
  **Done when:** all sections present.
  **Watch out:** no demo wording.

- [x] 6.2 Scrub, headers.
  **Why:** gate X.
  **Where:** all of `mc-view-app/`.
  **How:** `node scripts/spdx-check.mjs`; `grep -rniE "tenant|multitenant|ngrok|multiplatform" mc-view-app` prints nothing; remove `helpers.ts`, `types.ts`, `types/generated`, `intl-formatter.js`, `public/`.
  **Done when:** both checks pass.
  **Watch out:** `cute-text-phrases.ts` strings are fine; keep.

## 7. Quality gates

- [x] 7.1 Typecheck, lint, build.
  **Why:** Definition of Done.
  **How:** `cd mc-view-app && yarn typecheck && yarn lint && yarn build`.
  **Done when:** all exit 0 and `public/index.html` exists (ignored by git).
  **Watch out:** if `build` rejects a locator, remove it from the list ONLY after checking the docs; record it in design Risks R4.

## 8. Tests

- [x] 8.1 Unit tests.
  **Why:** the legacy view has no tests.
  **Where:** `src/utils/feature-flags.spec.ts`, `src/contexts/gate-state.spec.ts`, `src/utils/session-storage.spec.ts`, `src/hooks/fetch-usage.spec.ts`.
  **How:** feature flags - `encodeHostUrl` ASCII and unicode round-trip with `Buffer.from(x,'base64').toString('utf8')`; `applyFeatureFlagsToUrl` keeps existing query, appends `customView`, skips undefined, percent-encodes `+/=`; gate-state - table test of every branch; session-storage - stub `localStorage` to throw and expect `null`/no throw; fetch-usage - read all `src/**/*.ts(x)` files and assert only `use-fetch.ts` and `use-identity-mcp` import `forwardToFetch` (design D4).
  **Done when:** `yarn test` passes.
  **Watch out:** jsdom has no `TextEncoder` in some jest setups - polyfill in `jest.d.ts` setup if needed.

## 9. Drift guard

- [x] 9.1 Register guarded files.
  **Why:** spec "Build, hygiene and drift guard".
  **Where:** `scripts/check-duplicates.mjs`.
  **How:** add group `view-chat-parts` listing the files that must remain identical to mc-app: `utils/forward-to.ts`, `utils/gravatar.ts`, `utils/tool-call.ts`, `components/new-chat/types.ts`, `components/new-chat/parts/json-block.tsx`, `parts/text-part.tsx`, `typing-indicator/index.tsx`, `typing-indicator/use-typewriter.ts`, `hooks/use-service-image.ts`, `components/new-chat/parts/file-part.tsx` (the private-image loader of change P), `components/your-user-id/index.tsx` (only those which really are identical after your pruning - run `diff` to confirm).
  **Done when:** `node scripts/check-duplicates.mjs` exits 0; editing one guarded file makes it exit non-zero; revert.
  **Watch out:** if P changed one of these files in mc-app, copy the new version here.

## 10. Verification

- [ ] 10.1 Local Chrome run.
  **Why:** prove behaviour (R9).
  **Where:** `mc-view-app/`; scratch project (M3, M8); Custom View registered (M7).
  **How:** `cp .env.example .env`, fill `INITIAL_PROJECT_KEY`, `HOST_URI_PATH`, `CHAT_SERVICE_ENDPOINT_URL`; `yarn start`; run playbook `e2e/S-mc-view-app.md` (owned by V) with the Chrome DevTools MCP.
  **Done when:** E2E-S-01 .. E2E-S-12 pass (use the non-admin user for E2E-S-04/S-11/S-12 and the admin user for E2E-S-05; M10); evidence under `plans/evidence/s/`.
  **Watch out:** the identity popup requires the MC session cookie in the same Chrome profile.

- [x] 10.2 Final commands.
  **How:** `node scripts/check-duplicates.mjs && node scripts/spdx-check.mjs && (cd mc-view-app && yarn typecheck && yarn lint && yarn test && yarn build) && openspec validate s-mc-view-app --strict`.
  **Done when:** all exit 0.

Chrome scenario ids: **E2E-S-01** (panel appears on product page), **E2E-S-02** (send message, stream completes, `customView` param present), **E2E-S-03** (entity awareness: assistant answers about the open product - structural assertion only), **E2E-S-04** (project without binding shows the "ask an administrator" instruction, no composer; non-admin user), **E2E-S-05** (identity connect gate), **E2E-S-06** (popup blocked/cancelled), **E2E-S-07** (service unreachable: error + retry), **E2E-S-08** (reload resumes session), **E2E-S-09** (second locator: order detail page), **E2E-S-10** (no forbidden features: no tool menu/feedback), **E2E-S-11** (same panel for the admin user and the non-admin user: no admin control, no `userEmail`, no e-mail address in any forwarded URL/header/body in `list_network_requests`), **E2E-S-12** (the panel footer shows "Your user ID" equal to the bootstrap `userId`, read-only, with a working Copy button, for the admin user and the non-admin user).

## 11. Docs to update (for change W)

- `docs/architecture.md`: Custom View in the topology; flag-based entity context.
- `docs/how-it-works.md`: `customView` flag -> session scoping -> custom-view orchestrator.
- `docs/configuration.md`: `CUSTOM_VIEW_ID`, `CLOUD_IDENTIFIER`, `CHAT_SERVICE_ENDPOINT_URL`, dev-only `HOST_URI_PATH`.
- `docs/deployment.md`: register view (M7) -> deploy -> update URL; locator list.
- `docs/troubleshooting.md`: "panel blank", "not connected to Managed MCP", "popup blocked", "invalid_scope" (compare the view's `oAuthScopes` with the registered ones).
- `FEATURES.md` regeneration: Custom View section.
- `mc-view-app/README.md` is the per-app README for Connect certification.
