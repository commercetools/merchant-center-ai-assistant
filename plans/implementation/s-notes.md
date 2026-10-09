# Change S (s-mc-view-app): implementation notes

## Summary

Branch `worktree-agent-a1f4f24a55a9c3d35` (reset to `develop` = A..G, N, O, P, U). Tasks 0.1, 0.2, 0.4, 1.1-9.1 and 10.2 are ticked. Not ticked: 0.3 (no `docs/api.md` exists, I read G's notes and service code instead), 0.5 (web docs not read) and 10.1 (Chrome E2E, impossible here).

Built in `mc-view-app/` (all files carry SPDX headers, no `console.*`, no `userEmail`/`userLabel`, no admin UI):
- Config: `custom-view-config.mjs` with the 65 legacy locators verbatim and in order (count and uniqueness checked), CSP without ngrok/run.app/localhost/`unsafe-eval`, `img-src` `*.gstatic.com blob:`, four scopes, no permission group, no `additionalOAuthScopes`.
- Flag and transport: `utils/feature-flags.ts` (`encodeHostUrl` UTF-8 safe, `applyFeatureFlagsToUrl`), `contexts/feature-flags-context.tsx`, `hooks/use-fetch.ts`, `hooks/use-chat-service-connector/request.ts` (JSON calls through `useFetch`, blob loader through `forwardToFetch`).
- Bootstrap and gates: `hooks/use-mc-session` (`BootstrapError {status}`), `contexts/{auth,connect,gate-state}`, `components/{session-error,identity-mcp-connect-gate}.tsx`, `hooks/use-identity-mcp`.
- Chat: `components/new-chat/*` copied from mc-app and pruned (see README "Derived from mc-app"), `contexts/{session,tool-call-logs-config}`, `hooks/{use-suggestions,use-next-prompts,use-service-image}`, `components/your-user-id` in the footer.
- Tests (24 passed, 4 suites): feature flags, gate-state table, session-storage with throwing `localStorage`, fetch-usage (who may import `forwardToFetch`; no e-mail/admin wiring; `isAdmin` not read).
- `scripts/check-duplicates.mjs`: 18 new pairs (group `view-chat-parts`), now 19 groups.
- README per task 6.1.

Commands run (all exit 0) in `mc-view-app`: `yarn install`, `yarn typecheck`, `yarn lint`, `yarn test` (24 passed), `yarn build` (with the `.env.example` values; "Compiled successfully", `public/index.html` exists, so all 65 locators are accepted by the build). Root: `check-duplicates` (OK 19 groups; a trailing space in `json-block.tsx` makes it exit 1 with a `cp` hint, reverted), `check-versions`, `check-frontend-leftovers`, `spdx-check`, `check-repo-rules`, `check-connect-layout`, `openspec validate s-mc-view-app --strict` (valid). Scrub grep `tenant|multitenant|ngrok|multiplatform` over `mc-view-app` (without `node_modules`, `public`, `yarn.lock`) prints nothing.

## Questions (for the owner)

1. Session creation sends `featureFlags: {customView}` in the JSON body (G validates it) as well as `customView` on the URL. Is the body copy wanted? The legacy view did both; the service stores flags from the body on create, so I kept it.
2. The panel keeps `view_mcp_servers`/`manage_mcp_servers` (spec D7) although it never uses them. Drop them at registration (M7) if the registration accepts only key-value scopes?
3. `data:` images (the user's own attached images become `data:` URLs in `useChat`): `img-src` has `blob:` only. The App Kit default CSP may or may not allow `data:`. Check in E2E-S-02 with an attachment.
4. A "New chat" button is in the panel header (the panel needs some way to start a fresh conversation; there is no chats drawer). Is that acceptable under "no view switcher / floating actions"?
5. The greeting/default suggestions are mc-app's generic ones ("Ask about the page you have open..."). Should a Custom View have page-aware starters?

## Missed features / gaps found in the spec

- `docs/api.md` (named in 0.3, 1.1, 4.1) does not exist; the contract is only in G's code and notes. I used the service source (`/auth/session`, `session`, `session/all`, `session/:id/messages`, `digest`, `suggestions`, `tool-call-logs`).
- Task 3.2/9.1 list `utils/tool-call.ts` and `utils/gravatar.ts` as copied files; mc-app has no `utils/tool-call.ts` (the logic lives in `parts/tool-steps`), so nothing to copy or guard. I did not copy `gravatar.ts` (see Deviations 4).
- Task 4.1 says the bootstrap response may contain `workspace` fields and the legacy session context used them. G ships none and mc-app does not read any, so the panel does not either; the fallback (`GET session` flag-scoped, `GET session/:id/messages`) is the only path.
- Task 2.2 step 2 says `hostUriPath: '${env:HOST_URI_PATH}'`; O proved that breaks the Connect production build (see O notes, Deviation 1). I kept O's `process.env.HOST_URI_PATH || '/unset-dev-only/categories'`.
- Task 2.2 step 7 says `.env.example` has `INITIAL_PROJECT_KEY=your-project-key` and `HOST_URI_PATH=/your-project-key/...`; A's `check-repo-rules` rejects them (O notes). Left empty with comments (O's file untouched).
- Task 2.2 puts `PERMISSION_GROUPS` in `src/constants.ts`; with no group, that file has no content, so `src/constants.ts` is not created. The spec scenario "config and `src/constants.ts` are read" is then trivially satisfied.
- The spec's "images loaded through `forwardToFetch`" conflicts with design D4 ("only `use-fetch.ts` and `use-identity-mcp` import `forwardToFetch`"): the byte-identical `use-service-image.ts` calls `createServiceBlobRequest` from `request.ts`, which therefore imports `forwardToFetch`. The fetch-usage test allows `utils/forward-to.ts`, `use-fetch.ts`, `use-identity-mcp`, and `request.ts` (blob loader only).
- Spec scenario "Flag survives every call" lists session lookup, stream and digest/follow-up calls; the identity routes (`managed-mcp-identity/*`) do NOT carry the flag (they are not page-scoped and the identity change owns them). Image GETs do not carry it either. The scenario should say "session, stream, digest, suggestions and tool-call-logs calls".
- Spec "Reduced chat surface" says no "floating actions": mc-app's copy/try-again row under a reply (message actions) is kept without the rating buttons. Please confirm this is not a "floating action".
- `GET suggestions` and `GET tool-call-logs` also get `customView`; G's feature-flag middleware only runs on the session routes, so it is ignored there, but if G's suggestions route ever filters by flags, the panel would only see custom-view sessions (which is arguably right).
- Spec requirement "Session handling ... SHALL scope session lookup by the `customView` flag as provided by the service" is satisfied by the flag on `GET session`; `GET session/all` (flag-scoped) is read but only used to refresh after a turn.
- jest in `mc-view-app` was 30.2.0 (B left it); I aligned to mc-app's `29.7.0` + `jsdom ^21` because the shared preset needs it (the `test` script was an echo).

## TODOs (not done / unverifiable here)

- Chrome E2E not run (no Merchant Center login, deployed service or Chrome): **E2E-S-01 .. E2E-S-12** (10.1 stays open; `plans/evidence/s/` is empty). Highlights to check first: S-02 (`customView` on every forwarded URL, stream completes), S-04/S-11 (no binding, no e-mail in any request), S-05/S-06 (identity popup), S-12 (user id equals bootstrap `userId`, Copy works).
- `yarn start` was not run: the `HOST_URI_PATH` substitution spike (task 2.2) is moot with O's `process.env` approach, but whether the dev host page loads with the value in `.env` is unverified.
- CSP completeness (no `unsafe-eval`, `blob:` images, no gravatar, Nimbus fonts) is unverified in a browser.
- Unverified in a browser: panel layout in the `SMALL` panel width (composer, suggestion cards, footer user id line may be tight; fallback per D9 is to move the id into an overflow menu), `ChatMessageList` height inside the iframe, `useChat` resume after reload, StrictMode double effects.
- No unit test for the session context (stale-session recovery, flag in body on create) or `useMcSession` error mapping (401/403/5xx -> `BootstrapError.status`); covered only by E2E-S-07/08. Candidate follow-up.
- `commercetools connect validate` not run (Docker unavailable); `connect.yaml` untouched.
- Docs for W are listed in `tasks.md` section 11; nothing written here.
- Guarded-file list was chosen by `cmp` after pruning; if mc-app changes `use-service-image.ts`, `typing-indicator` or a part, the drift check forces the copy here.

## Deviations from the spec (with reason)

1. Stayed on the worktree branch instead of `git switch -c spec/s-mc-view-app` (task 1.1), as the other changes did.
2. `hostUriPath` and `initialProjectKey` stay O's `process.env.X || 'unset-dev-only'` instead of `${env:HOST_URI_PATH}` (production build in Connect would fail).
3. No `src/constants.ts` (see gaps).
4. No Gravatar and no `utils/gravatar.ts`, no `use-current-user`: the panel never reads the user's e-mail (spec: "no e-mail handling"), so `UserAvatar` shows initials and the greeting uses the first name only. `gravatar.com` removed from CSP `img-src` (and `blob:` added for private images). This removes `gravatar.ts` from the guarded list.
5. Guarded group is `view-chat-parts` as 18 file pairs expanded in `check-duplicates.mjs` (the script compares the first file of a group with the rest, so a pair per file was needed). `components/new-chat/types.ts`, `layout.ts`, `agent-avatar.tsx`, `export-part`, `reasoning-part`, `source-part`, `cute-text-*`, `material-icons.ts` and `types/chart.ts` are guarded too because they stayed byte-identical; `utils/tool-call.ts` does not exist (see gaps).
6. `@ai-sdk/react` pinned to `4.0.95` exactly (as P), `react-google-charts ^5.2.1` and `@tabler/icons-react ^3.35.0` added (visualization part, agent avatar), jest 29.7.0 + jsdom added.
7. Connector, types, session and tool-call-logs contexts are rewritten (not copied) and much smaller than mc-app's: no tools, feedback, delete, queued prompts, config save. They carry "Derived from" headers. `ToolCallLogsConfigContextType.state` keeps mc-app's shape so the guarded typing indicator reads it unchanged.
8. `request.ts` takes the flag-aware `fetch` as a parameter (`createServiceRequest(endpoint, fetchFn)`) instead of calling `forwardToJson`; the 4xx/5xx still throws `ForwardToError`, so `getMessages` keeps its 404 handling.
9. Bootstrap uses `useFetch` and a `BootstrapError` carrying `status` (task 4.1 says typed `BootstrapError {status, message}`); `auth.tsx` is mc-app's with `isForwardToError` replaced by `BootstrapError`. The context still exposes `isAdmin` (stored, never read; a test asserts only `auth.tsx` and `use-mc-session` mention it).
10. A "New chat" button was added to the panel (see Question 4), and the conversation header/tabs/chats drawer were not ported.
11. The `ErrorBoundary` component of the legacy view was not copied (unused there).
