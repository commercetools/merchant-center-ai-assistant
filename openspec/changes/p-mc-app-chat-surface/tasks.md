## 0. Read first

- [x] 0.1 Read `proposal.md` and `design.md` here (Explore findings 1-9, Decisions D-P1..D-P9), `openspec/changes/o-frontend-foundation/design.md` (what O already gives you), `plans/04-workflow.md` sections 3-5.
- [x] 0.2 Read, once, the legacy entry points: `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/components/new-chat/index.tsx`, `.../new-chat/chat-area.tsx`, `.../contexts/session.tsx`, `.../hooks/use-chat-service-connector/use-chat-service-connector.ts`.
- [x] 0.3 Read the REST contract: `openspec/changes/g-chat-sessions-and-digest/` and `h-agents-and-chat-stream/` if present (their `specs/` and `design.md`), otherwise the legacy route files in `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/routes/{session,suggestions,ai-chat,tool-call-logs,feedback}.route.ts`.
- [x] 0.4 Skim the Nimbus component docs only when a task says so (`ToolSearch select:mcp__nimbus__get_component` then call it for the named component).

You should now be able to explain: how a message goes from the composer to `forwardToFetch` to the stream and back into `useChat`; why `ChatArea` is never unmounted when switching tabs; why the session id is adopted without validation; what a "digest" is and why follow-up chips poll for it.

## 1. Setup and the port recipe

Conventions used by every task below:
- `L` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src` (legacy, read-only, never edit). `N` = `mc-app/src` in this repo. Define in your shell: `export L=/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src`.
- **Port recipe (PR)** for a file: (1) `mkdir -p` the target folder; (2) `cp $L/<path> $N/<path>`; (3) prepend `// SPDX-License-Identifier: MIT` plus the copyright line from change A as the first lines; (4) delete every `console.log/warn/error/info` (replace with nothing, or surface the error in the UI where the code relies on it); (5) remove words `tenant`, `multitenant`, `team` from comments; (6) remove `userEmail` per D-P1 where the task says; (7) `cd mc-app && yarn typecheck` must pass; (8) one git commit `feat(mc-app): port <name>`.
- A task that says "PR <paths>" means apply this recipe to each path (one commit for the group of small files).

- [x] 1.1 Check prerequisites. **How:** `git switch -c spec/p-mc-app-chat-surface`; `cd mc-app && yarn install --frozen-lockfile && yarn typecheck`. **Expected:** exit 0 (O's foundation compiles). If `mc-app/src/utils/forward-to.ts` is missing, stop: change O is not implemented.
- [x] 1.2 Add runtime dependencies P needs, from `$L/../package.json`: `ai` `7.0.92`, `@ai-sdk/react` `^4.0.95`, `react-google-charts`, `@tabler/icons-react`, `agentation` `3.1.2`, `@babel/standalone` + `@types/babel__standalone`, `@apollo/client` `3.13.9`, `@chakra-ui/react`. **How:** `yarn add <pkg@version>` for those missing in `mc-app/package.json` (O may already have kept them). **Done when:** `grep -c '"agentation"' mc-app/package.json` prints 1. **Watch out:** keep versions identical to legacy (App Kit peers).
- [x] 1.3 Create the evidence folder note: `mkdir -p plans/evidence/P` (git-ignored). **Done when:** folder exists.
- [x] 1.4 Learn the leftovers check. **How:** O ships `scripts/check-frontend-leftovers.mjs` (flags `console.log`, tenant words, ngrok); run `node scripts/check-frontend-leftovers.mjs` at the end of every section. **Done when:** it runs (exit 0 or a list of your own unported files to fix).

## 2. Types, storage, utilities

- [x] 2.1 Port the service types. **Where:** `N/hooks/use-chat-service-connector/types.ts` <- `$L/hooks/use-chat-service-connector/types.ts` (471 lines). **How:** PR, then delete the types that belong to Q: `BackofficeThread*`, `GetBackoffice*`, `IsAdminResponse`, `FeedbackSummary`, `FeedbackRecord`, `GetFeedbackEntries*`, `GetSystemPromptConfigResponse`, `SetSystemPromptConfigResponse` and move them into `N/hooks/admin-types.ts` (create it; Q imports from there). Keep `SubmitFeedbackRequest/Response` here. DELETE (do not move) every `MCP*`/`Create|Update|Delete|UpsertMCPConfig*` type: provider credentials are Connect configuration (owner decision Q4) and Q defines the read-only `McpProviderStatus` instead. **Done when:** typecheck passes. **Watch out:** Q's change adds the admin types file contents; here only create the file with the moved blocks so nothing is lost.
- [x] 2.2 PR `utils/session-storage.ts`, `utils/gravatar.ts`, `utils/relative-time.ts`, `utils/material-icons.ts`. **Done when:** typecheck passes. **Watch out:** `session-storage.ts` must keep try/catch around every `localStorage` access (Safari private mode, embedded origins) - only remove the `console.warn` calls.
- [x] 2.3 PR `types/chart.ts` (140 lines) and `utils/feedback-payload.ts` (191 lines). **Done when:** typecheck passes.
- [x] 2.4 Port `hooks/use-current-user` is O's; confirm `grep -n "export const useCurrentUser" mc-app/src/hooks/use-current-user.ts` finds it. **Done when:** yes.

## 3. Chat service connector

- [x] 3.1 Write the request helper. **Where:** `N/hooks/use-chat-service-connector/request.ts` (new). **How:** export `useServiceRequest()` returning `request<T>(method, path, body?)` built on `forwardToFetch` from `utils/forward-to`: URL = `${chatServiceEndpointUrl}${path}`; JSON body when given; `!res.ok` -> throw `ForwardToError` (reuse `forwardToJson` for success path); returns parsed JSON. No `console`. **Done when:** a unit-less smoke: typecheck passes and the function signature is `(method: string, path: string, body?: unknown) => Promise<T>`.
- [x] 3.2 Port the connector (session part). **Where:** `N/hooks/use-chat-service-connector/use-chat-service-connector.ts` <- `$L/hooks/use-chat-service-connector/use-chat-service-connector.ts` (692 lines). **How:** keep only: `createSession`, `getLastSession`, `getSession`, `updateSession`, `getMessages` (returns `{ success, data, notFound }` on 404), `getSessionTools`, `updateSessionTools`, `getAllSessionsSummary`, `getSessionDigest`, `getSuggestions`, `deleteSession`, `getToolCallLogsConfig`, `setToolCallLogsConfig` (admin-only on the service: 403 `ADMIN_REQUIRED` for others; only Q's admin settings call it), `submitFeedback`. Remove the `userEmail` argument and the `params.append('userEmail', ...)` lines (D-P1). Paths exactly: `session`, `session/${id}`, `session/all`, `session/${id}/messages`, `session/${id}/tools`, `session/${id}/digest?since=${since}`, `suggestions?locale=${locale}`, `tool-call-logs`, `feedback/submit`. **Done when:** `grep -c userEmail <file>` prints 0; typecheck passes. **Watch out:** `getMessages` must map HTTP 404 to `{ notFound: true }` (it is how stale ids are detected); other failures must throw. The methods for MCP configs, system prompt, backoffice and feedback listing are NOT ported here; Q ports them into `use-admin-connector.ts` using `request.ts`.
- [x] 3.3 Port `use-chat-connector.ts` and `index.ts`. **Where:** `N/hooks/use-chat-service-connector/{use-chat-connector.ts,index.ts}` <- legacy same. **How:** remove `workspace`/`pendingWorkspaceMessages`; `loadMessages(sessionId)` calls `getMessages`, on `notFound` calls `resolveStaleSession(sessionId)`; keep the `FrontendChatMessage` export only if something imports it (`grep`), else drop. **Done when:** typecheck passes.
- [x] 3.4 Contract check. **How:** compare each path/envelope in 3.2 with G's `specs/*/spec.md` (or `docs/api.md` once W writes it). **Done when:** a short list "deviations: none" or a list is added to `design.md` under "Explore findings" item 1 and the connector adjusted.

## 4. Session context

- [x] 4.1 Port `contexts/session.tsx` (527 lines) in two commits. **Where:** `N/contexts/session.tsx`. **How (commit 1):** PR the file as is; **(commit 2):** apply D-P2: remove `workspace` use; `useApplicationContext` email -> not needed; `createNewSession` posts `{ title, userLabel? }` (Q-P4; `userLabel` = `useCurrentUser().email`, DISPLAY-ONLY and unverified, sent in the body only, never as query/header/`userEmail`; omit when empty) with default title `New chat`; `initializeSessionFromStorage` = stored id -> `fetchLastSession` -> `createNewSession`; delete `fetchLastSession` try/catch swallowing: on failure call `createNewSession()`. Keep `queuePrompt`, `pendingPrompt`, `clearPendingPrompt`, `recoveredIds`, `resolveStaleSession`, `refreshSessions`, `fetchSessionTools`, `updateTools`, `deleteSessionById`, `setCurrentSession`. **Done when:** `grep -n "workspace\|userEmail\|console" N/contexts/session.tsx` prints nothing; typecheck passes.
- [x] 4.2 Session list on mount. **How:** a `useEffect` that calls `getAllSessions()` when `isAuthenticated` (the legacy "only if bootstrap did not supply it" condition is removed). **Done when:** opening the app issues exactly one `GET session/all`.
- [x] 4.3 Delete-current logic check. **How:** read `deleteSessionById`: after DELETE it must pick the next session from the *refreshed* list, not the stale `allSessions` closure; refactor to use the list returned by `getAllSessionsSummary`. **Done when:** typecheck passes; scenario E2E-P-05 covers it later.

## 5. Motion

- [x] 5.1 PR `motion/{index.ts,tokens.ts,presets.ts,use-motion.ts,use-reduced-motion.ts,use-flip-transition.ts}` (6 files). **Done when:** typecheck passes. **Watch out:** the folder rule "no component declares its own `animation*`/`transition*` props" - keep it; copy `motion/README.md` into `mc-app/src/motion/README.md` unchanged (W will relocate it).

## 6. Shell

- [x] 6.1 PR `components/shell/view-tabs.ts` and `components/new-chat/{layout.ts,theme.ts,types.ts}`. **Done when:** typecheck passes.
- [x] 6.2 PR `components/new-chat/{agent-avatar.tsx,user-avatar.tsx}`. **Watch out:** `user-avatar` uses `useGravatar` (`utils/gravatar.ts`); keep (D-P8).
- [x] 6.3 Rail atoms. PR `components/shell/app-rail/{rail-item.tsx,rail-badge.tsx,new-chat-tile.tsx}`.
- [x] 6.4 Rail container. **Where:** `N/components/shell/app-rail/index.tsx` <- `$L/components/shell/app-rail/index.tsx`. **How:** PR; `DrawerId = 'chats' | 'pages' | 'mcp' | 'config'` stays, but render only New chat, Chats, Pages, Help; leave a `{/* Q: Connections (admin) and Settings items go here */}` comment between Pages and the spacer. Remove `useIsAssistantAdmin` import. **Done when:** typecheck passes.
- [x] 6.5 Contexts used by the rail. PR `contexts/tabbed-header-context.tsx` (134 lines) - it drives the Pages highlight.
- [x] 6.6 Conversation header. PR `components/shell/conversation-header/{index.tsx,header-actions.tsx,session-meta.tsx,session-title.tsx,view-switcher.tsx}`. **Watch out:** the header shows the number of reachable tools: it reads `sessionTools` from `useSession()`; confirm the field names after 4.1.
- [x] 6.7 Create the `YourUserId` component and mount it in the user menu. **Why:** an operator must be able to learn their own Merchant Center user id to put it into `ADMIN_USER_IDS`. **Where:** new `mc-app/src/components/your-user-id/index.tsx` (+SPDX); mounted by editing `components/new-chat/user-avatar.tsx` / the rail container so the user avatar opens a small Nimbus popover (the user menu) containing it (create the popover if the rail has none). **How:** `const { userId } = useAuth(); if (!userId) return null;` render a text line `Your user ID:` followed by the id in a monospace `Text` and a Nimbus `Button` "Copy" calling `navigator.clipboard.writeText(userId)` (fallback: select the text) that shows "Copied" for 2 s; no `input`, no link, no e-mail, no request; accept an optional `variant: 'compact' | 'footer'` prop for S and Q. **Done when:** typecheck and lint pass; `grep -n "input\|mailto" mc-app/src/components/your-user-id/index.tsx` prints nothing. **Watch out:** show it to non-admins too (do not call `useIsAssistantAdmin`); Q reuses this exact component in Settings > About.

## 7. Chats drawer

- [x] 7.1 PR `components/panels/chats-drawer/{chat-group.tsx,chat-row.tsx,delete-chat-dialog.tsx,index.tsx}`. **Done when:** typecheck passes. **Watch out:** search matches title AND description; grouping is by day (uses `utils/relative-time.ts`).

## 8. Conversation core

- [x] 8.1 PR `components/new-chat/{thinking-pill.tsx,typing-indicator/index.tsx,typing-indicator/cute-text-animator.tsx,typing-indicator/cute-text-phrases.ts,typing-indicator/use-typewriter.ts}`.
- [x] 8.2 PR `components/new-chat/{message.tsx,follow-up-chip.tsx,follow-up-chips.tsx}`. (They import `parts/*`; if typecheck fails on missing parts, do section 12 first and come back - or create empty stubs `export const PartRenderer = () => null` and delete the stub when 12 lands.)
- [x] 8.3 `chat-area.tsx`, part 1 (port). **Where:** `N/components/new-chat/chat-area.tsx` (421 lines) <- legacy same. **How:** PR; keep as is for now. **Done when:** file exists (typecheck may fail until sections 9-12 land; if so, list the missing imports in the commit message).
- [x] 8.4 `chat-area.tsx`, part 2 (changes). **How:** delete `sendAutomaticallyWhen: hasClientSideToolCallsPending` and the import; remove `userEmail` from `submitFeedback(...)` calls (two sites) ; keep `MAX_RETRIES = 2`, `RETRY_DELAY_MS`, `messagesRef`, `useFlipTransition`, `pendingPrompt` effect. **Done when:** `grep -n "userEmail\|hasClientSide" N/components/new-chat/chat-area.tsx` prints nothing.
- [x] 8.5 `new-chat/tools/index.ts`. **Where:** `N/components/new-chat/tools/index.ts`. **How:** PR then delete `CLIENT_TOOLS` and its comment; keep the other three exports. **Watch out:** `SUBAGENT_TOOLS` contains `bigquery` - correct, L keeps BigQuery.
- [x] 8.6 Stream URL. **Where:** `N/components/new-chat/index.tsx` (175 lines, `url` memo). **How:** `new URLSearchParams({ locale: dataLocale })`; no `userEmail`. See 13.x for the rest of the file. **Done when:** the string `userEmail` does not appear in the file.

## 9. Composer

- [x] 9.1 PR `components/new-chat/composer/{disclaimer.tsx,send-hint.tsx,send-button.tsx,attach-button.tsx,selected-files.tsx,tools-button.tsx,sources-panel.tsx}`.
- [x] 9.2 PR `components/new-chat/composer/index.tsx` (175 lines). **Watch out:** one mounted instance across empty and chat states; do not add `key` props that remount it. Accepted types constant stays `['.txt', '.csv', '.log', 'image/*']`.

## 10. Empty state and suggestions

- [x] 10.1 PR `components/new-chat/empty-state/{section-label.tsx,greeting.tsx,default-suggestions.ts,suggestion-card.tsx,suggestion-cards.tsx,recent-chat-row.tsx,recent-chats.tsx,index.tsx}`. **How:** in `default-suggestions.ts` reword any text mentioning "team". **Done when:** `grep -in team N/components/new-chat/empty-state` prints nothing.
- [x] 10.2 Port `hooks/use-suggestions.ts`. **How:** PR; call `getSuggestions(dataLocale)` (no email); keep the `hasFetched` ref (one request per mount); on failure show nothing (defaults render). Replace `console.warn`. **Done when:** typecheck passes.

## 11. Follow-ups, actions, feedback

- [x] 11.1 Port `hooks/use-next-prompts.ts`. **How:** PR; remove `workspace` seeding and the email argument: `getSessionDigest(sessionId, 0)` / `(sessionId, turnFinishedAt)`; keep `POLL_SCHEDULE_MS = [900, 1800, 2500, 3000]`, clear on session change, cancel on unmount. **Done when:** typecheck passes.
- [x] 11.2 PR `components/new-chat/message-actions.tsx`, `components/new-chat/feedback-popup.tsx`. **How:** feedback popup calls `submitFeedback(body)` with no `userEmail`; the body MAY carry `userLabel` (display-only, from `useCurrentUser().email`, unverified; the service sanitises it and the backoffice shows it as text marked "(unverified)"). **Watch out:** never send the label anywhere but the JSON body; popup stays open with typed comment on failure.

## 12. Message-part renderers

- [x] 12.1 PR `parts/{text-part.tsx,json-block.tsx,file-part.tsx,source-part.tsx}`.
- [x] 12.1b Private image loading (owner decision Q9).
  **Why:** the browser cannot attach the forward-to JWT to `<img src>`, and the service streams images only to authenticated callers (change L, `GET /files/:sessionId/:fileName`); spec "Private images load through the service".
  **Where:** create `N/hooks/use-service-image.ts`; edit `N/components/new-chat/parts/file-part.tsx` (ported in 12.1) to use it.
  **How:** `useServiceImage(url?: string)`: `useState` for `{status, objectUrl}`; `useEffect([url, attempt])`: if `url` does not start with `/files/` -> `{status:'idle'}`; else create an `AbortController`, call `forwardToFetch` via the request helper from 3.1 (add `requestBlob(path, signal)` next to `request`: same URL building `${chatServiceEndpointUrl}${path}`, `!res.ok` -> throw `ForwardToError`), verify `blob.type.startsWith('image/')`, `const objectUrl = URL.createObjectURL(blob)`, set state; cleanup: `controller.abort()` and `URL.revokeObjectURL(objectUrl)` of the URL created by THIS effect run; a module-level `Map<string, Promise<Blob>>` de-duplicates concurrent identical requests (delete the entry when it settles; do not cache blobs across mounts). `retry()` increments `attempt`. `file-part.tsx`: image media type + `/files/` -> use the hook (skeleton box 4:3 while `loading`, `<img src=objectUrl alt=filename ?? 'Generated image' loading="lazy">` when `ready`, placeholder text "Image unavailable" + Retry button when `error`); absolute `https://` URL -> plain `<img referrerPolicy="no-referrer">`; anything else -> render nothing. Use Nimbus primitives already used by sibling parts for the skeleton/button; no `console.*`.
  **Done when:** `yarn typecheck` passes; the four scenarios of "Private images load through the service" are exercised manually in E2E-P-15; grep shows `createObjectURL` only in this hook and every call has a matching `revokeObjectURL` in the cleanup.
  **Watch out:** React 18 StrictMode mounts effects twice in development: the cleanup revoke makes the first object URL invalid, so never store an object URL outside the effect that created it; do not set `<img src>` to the relative `/files/...` path anywhere (it would hit the Merchant Center origin, not the service). The same hook is copied by change S and used by Q's transcript views.
- [x] 12.2 PR `parts/{reasoning-part.tsx,subagent-part.tsx}`. **Watch out:** `subagent-part` recurses into `PartRenderer`; import cycles are intended (lazy through `parts/index.tsx`).
- [x] 12.3 PR `parts/tool-steps/{collect-tool-steps.ts,humanize-tool.ts,tool-step-row.tsx,index.tsx}`.
- [x] 12.4 PR `parts/export-part.tsx`.
- [x] 12.5 Visualization. PR `parts/visualization/{types.ts,chart-renderer.tsx,visualization-part.tsx,index.tsx}`. **Watch out:** 16 chart kinds in `types/chart.ts`; `DonutChart` -> `PieChart` + `pieHole`; wrap `Chart` render in try/catch fallback text for malformed specs (spec "Bad spec").
- [x] 12.6 PR `parts/gen-ui-part.tsx` (needs `compose-preview-context`, task 16.x - create a stub import only after 16.1 is done; do 16.1 first).
- [x] 12.7 PR `parts/annotations-part.tsx` (needs `preview-annotations/annotation-payload.ts` from 18.1).
- [x] 12.8 PR `parts/index.tsx` (159 lines, the dispatcher). **Done when:** typecheck passes with all parts present; remove the temporary stub from 8.2.

## 13. Tool-call-logs and the shell page

- [x] 13.1 Port `contexts/tool-call-logs-config.tsx` (232 lines). **How:** PR; on mount `GET tool-call-logs` (do not wait for `isAuthenticated=false`); initial `mode: 'none'` until loaded (Q-P2); seed from `useAuth().toolCallLogs` when the bootstrap supplied it (change G contributes it), otherwise fetch. Exposes `showToolCalls`, `showReasoning`, `state`, `setMode`, `saveConfig`, `loadConfig`. **Done when:** typecheck passes.
- [x] 13.2 Port `components/interactive-tab-content/index.tsx` and `components/new-chat/index.tsx` (rest of the file after 8.6). **How:** PR; in `NewChat` remove `ManageMcpPanel`, `SettingsDrawer` imports and mounts (Q re-adds), remove `workspace`/email; keep suggestions + next-prompts hooks at this level (Explore finding 7). **Done when:** typecheck passes after sections 16-18.

## 14. Per-session tool menu

- [x] 14.1 PR `components/new-chat/server-tools/{group.tsx,tools-panel.tsx}`. **How:** `tools-panel` keeps local draft state; Save calls `updateTools(fullGroupedList)`; closing resets the draft; filter is client-side. **Done when:** typecheck passes. **Watch out:** "dismissing discards unsaved toggles on purpose" - do not add auto-save.

## 15. Providers wiring (partial)

- [x] 15.1 Edit `N/contexts/index.tsx` (O wrote it). **How:** add `ToolCallLogsConfigProvider`, `TabbedHeaderProvider`, `ComposedPagesProvider` (after 16.x), `SessionProvider autoCreateSession` in the legacy nesting order; leave `// Q: BackofficeProvider, McpProvidersProvider, SystemPromptConfigProvider` placeholders. **Done when:** typecheck passes.

## 16. Composed pages infrastructure

- [x] 16.1 PR `contexts/compose-preview-context.tsx` (159), `contexts/composed-page-context.tsx` (126).
- [x] 16.2 PR `types/composed-page.ts` (255) and `utils/schema-helpers.ts` (97) (identical to composed-apps' copy; R may add it to `scripts/check-duplicates.mjs`).
- [x] 16.3 PR `utils/nimbus-surface.generated.ts` is produced by O; verify `ls N/utils/nimbus-surface.generated.ts`.
- [x] 16.4 `utils/babel-renderer.tsx`, commit 1: copy 1294 lines (PR) only. **Done when:** file exists.
- [x] 16.5 `babel-renderer.tsx`, commit 2: read the file top to bottom once and write a 10-line comment block at the top summarising `IMPORT_MAP` (react, react-router-dom v5 helpers, `commercetools` = whole Nimbus surface, `Icons` namespace), error phases (`decode|transpile|execute|render|data-fetch`) and the `data-ct-component` tagging; remove legacy comments mentioning the router repo path. **Done when:** typecheck passes. **Watch out:** do not change logic; behaviour is tested only in Chrome (E2E-P-11).
- [x] 16.6 PR `components/ui-error-boundary/index.tsx` (400) and `components/composed-page-chart/index.tsx` (224).
- [x] 16.7 PR `components/page-renderer/index.tsx` (283).
- [x] 16.8 PR `contexts/data-sources-context.tsx` (478). **How:** at the two `target === 'BIG_QUERY'` guards (legacy lines ~185 and ~344) keep behaviour but make the message a visible per-component notice "This data source is no longer supported" instead of silent skip, per spec.
- [x] 16.9 PR `hooks/use-graphql/index.ts`, `hooks/use-composed-pages-connector/*.ctp.graphql` (4 files), `graphql.d.ts`; check the webpack loader for `.graphql` is provided by `mc-scripts` (legacy builds with it) by running `yarn build`.
- [x] 16.10 PR `hooks/use-composed-pages-storage/{index.ts,use-composed-pages-storage.ts}` (459) and `contexts/composed-pages-context.tsx` (244). **Watch out:** container key is `SHARED_COMPOSED_PAGES_CONTAINER_KEY` from `constants.ts`; M decides the final name.

## 17. Preview and Code tabs, pages drawer and route

- [x] 17.1 PR `components/compose-preview/{index.ts,compose-preview.tsx}` (321) and `components/code-preview/{index.ts,code-preview.tsx}`.
- [x] 17.2 PR `components/panels/composed-page-panel/{index.tsx,composed-pages-list.tsx,page-row.tsx,pages-empty-hint.tsx}`.
- [x] 17.3 PR `components/composed-page-view/{index.ts,composed-page-view.tsx,composed-page-settings.tsx}` (skip `messages.ts`, dead).

## 18. Annotations (Agentation)

- [x] 18.1 PR `components/preview-annotations/{annotation-payload.ts,build-annotation-payload.ts}` (typed contract + payload builder). **Watch out:** the header comment names the router file path - rewrite it to "the service module defined by change H (`annotation-part`)".
- [x] 18.2 PR `components/preview-annotations/{agentation-shadow-root.ts,seed-agentation-defaults.ts,use-agentation-theme.ts}`.
- [x] 18.3 PR `components/preview-annotations/{use-annotation-scope.ts,use-feedback-mode-sync.ts}`.
- [x] 18.4 PR `components/preview-annotations/{annotate-toggle.tsx,preview-annotations.tsx,index.ts}`; wire into `compose-preview.tsx` as legacy does. **Done when:** typecheck passes; `grep -n "ct-component" N/utils/babel-renderer.tsx` finds the tagging.
- [x] 18.5 Confirm `chat-area.tsx` consumes `pendingPrompt` with `parts` and sends `{ type: 'text', text }` + `data-ct-annotations`; **Done when:** read-through matches legacy lines 245-285.

## 19. Routes and final wiring

- [x] 19.1 Edit `N/routes.tsx` (O's skeleton). **How:** port the router tree from `$L/routes.tsx` for P's routes only: `<Route path={`${match.path}/composed/:pageKey`}>` wrapped in `SuspendedRoute` + `WrappedContent` + `ComposedPageView urlToParent={match.url}`, and the fallback `<Route><NewChat /></Route>`; leave Q's two route blocks as comments. Remove the foundation placeholder text. **Done when:** `yarn typecheck && yarn lint && yarn build` pass.
- [x] 19.2 Dead-code scan. **How:** `node scripts/check-frontend-leftovers.mjs`; `grep -rn "userEmail\|workspace\|x-mc-team\|CLIENT_TOOLS" mc-app/src` -> only Q's pending files may match. **Done when:** no matches in P files.
- [x] 19.3 SPDX check: `node scripts/spdx-check.mjs`. **Done when:** exit 0.

## 20. Chrome scenarios (E2E-P-nn)

Preconditions for all: change G/H deployed to the sandbox (or tunnel) service, the app registered (O 10.1), Chrome logged in to Merchant Center (M8), `mc-app` running (`yarn start`) or deployed. Tools: `mcp__chrome-devtools__navigate_page`, `take_snapshot`, `fill`, `click`, `press_key`, `wait_for`, `evaluate_script`, `list_network_requests`, `get_network_request`, `list_console_messages`, `take_screenshot`. Evidence under `plans/evidence/P/<id>-*`. Assert structure, never wording. Clean up: delete sessions you created.

- [ ] 20.1 **E2E-P-01 first load.** Steps: `evaluate_script` `localStorage.removeItem('chat-session-id')`; navigate to the app; wait for the greeting text ("Good ..." or the user's first name). Assert: greeting visible; 4 suggestion cards (`take_snapshot` count of cards, or fallback defaults); composer present; network shows one `POST session`, one `GET suggestions`, one `GET tool-call-logs`; no forwarded URL contains `userEmail`; zero console errors.
- [ ] 20.2 **E2E-P-02 send message streams to completion.** Steps: `fill` composer with `e2e-hello: reply with one short sentence`, press Enter. Assert: user bubble appears; assistant bubble grows; `status` returns to idle (send button enabled, typing indicator gone) within 90 s; the stream request returned 200 with `text/event-stream`; the URL has only `locale` query; no error banner.
- [ ] 20.3 **E2E-P-03 tool part appears.** Steps: send `e2e-tool: search the commercetools docs for "custom objects" and summarise in two lines`. Assert: a tool-steps pill ("Checked N sources") or a tool block appears (requires tool-call-logs mode `tools` or `all`; if hidden, set via Q's settings or `PUT tool-call-logs` once); stream completes. Uses the public docs MCP so it does not need identity connect.
- [ ] 20.4 **E2E-P-04 sessions list and title.** Steps: click rail "Chats"; assert the list contains the current session; click "New chat" (rail tile); send `e2e-title: hi`; after completion wait up to 10 s; assert the Chats drawer shows a title different from "New chat"; list order newest first.
- [ ] 20.5 **E2E-P-05 delete session.** Steps: in Chats drawer hover a session row `e2e-*`, click delete, assert dialog; Cancel -> no `DELETE` in network; delete again and confirm -> `DELETE session/<id>` 200, row gone; if it was the open session the app shows another or a new empty one.
- [ ] 20.6 **E2E-P-06 reload restores.** Steps: open session with messages; `navigate_page` reload; assert same first user message text present and `localStorage['chat-session-id']` unchanged.
- [ ] 20.7 **E2E-P-07 tool toggles are saved.** Steps: click composer "Tools", search `order`, toggle one tool off, press Save; assert `PUT session/<id>/tools` 200; reload; reopen Tools: the tool is still off. Then toggle on, close the panel WITHOUT saving, reopen: still off (discard) and no second PUT.
- [ ] 20.8 **E2E-P-08 follow-up chips.** After a completed turn wait up to 8 s; assert up to 3 chips; click one: its text is sent as a new user message and chips disappear. Also: switch to another session -> chips are cleared.
- [ ] 20.9 **E2E-P-09 feedback.** Click thumbs-down under the last reply; popup opens with sentiment pre-selected; type `e2e-feedback`; submit; assert `POST feedback/submit` 201 and popup closes. Negative: use `evaluate_script` to monkey-patch nothing; instead block the request via the DevTools "emulate offline" tool (`mcp__chrome-devtools__emulate`) and assert popup stays with the comment.
- [ ] 20.10 **E2E-P-10 chart renders.** Send `e2e-chart: show a bar chart of 3 made-up categories with values 1,2,3`; assert a chart container (`svg` or Google Charts element) inside the transcript OR a `visualize_data` tool block; stream completes. (LLM-dependent: pass if either the chart or a graceful text answer exists and no console exception from `chart-renderer`.)
- [ ] 20.11 **E2E-P-11 preview, code, save page, pages route.** Send `e2e-page: build a simple page with a heading and a button`; assert the Assistant/Preview/Code switcher appears; Preview renders text; Code shows source; save via the assistant (ask `save this page as e2e-page`) then Pages rail count increases; open Pages drawer -> row -> URL contains `/composed/`; page renders; delete via settings cog with confirmation. Clean up the page.
- [ ] 20.12 **E2E-P-12 annotations.** On Preview use the annotate toggle; click a heading; type comment `e2e-note`; Send. Assert a new user message shows the list item and a collapsed "Details sent to the assistant"; expand shows JSON containing `componentNames`; network request body contains a part of type `data-ct-annotations`.
- [ ] 20.13 **E2E-P-13 stale session recovery.** `evaluate_script` set `localStorage['chat-session-id']='00000000-0000-0000-0000-000000000000'`; reload. Assert one `GET session/.../messages` 404 followed by `GET session` (last) or `POST session`; no error banner; no request loop (count of 404s is 1).
- [ ] 20.14 **E2E-P-14 attachments.** Use `upload_file` with a small `e2e.txt`; chip appears; send; stream completes; chip cleared. Negative: try a `.exe` filename -> not added.
- [ ] 20.15 **E2E-P-15 private image displays.** Needs change L deployed with a valid service-account key (default `IMAGE_URL_MODE=private`). Send `e2e-image: generate a small picture of a red square`; wait for the stream to finish. Assert: a transcript `<img>` with `naturalWidth > 0` whose `src` starts with `blob:`; `list_network_requests` contains `GET .../service/files/<sid>/<file>` with status 200 and a response header `cache-control: private, no-store`; no request from the page to `storage.googleapis.com`; reload the page: the image renders again; switch to another session and back: no console errors. Negative: block the files request with the DevTools network "block URL" emulation and assert the "Image unavailable" placeholder with a Retry button (then unblock and click Retry -> the image shows).
- [ ] 20.16 **E2E-P-16 own user id is shown.** As the non-admin user and as the admin user: click the user avatar in the rail; `take_snapshot` finds "Your user ID" with a value equal to the `data.userId` of the `/auth/session` response; assert no `input` element in the popover; click "Copy" and assert the button text changes to "Copied" and no new `forward-to` request was sent. Then, as the operator, add the non-admin user's id to `ADMIN_USER_IDS` with `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<idA>,<idB>`, wait for the redeploy, reload the app: the bootstrap now has `isAdmin: true` for that user and the admin surfaces (change Q) appear; restore the original value afterwards. **Evidence:** `P-16-*.png` (ids redacted).

## 21. Verification

- [x] 21.1 Unit tests: none (legacy has none; decision recorded in O D-O11). Instead add compile-time guards: none required.
- [x] 21.2 Gates: `cd mc-app && yarn typecheck && yarn lint && yarn build` -> exit 0.
- [ ] 21.3 Root gates: `node scripts/check-duplicates.mjs` (OK), `node scripts/check-frontend-leftovers.mjs` (exit 0), `node scripts/spdx-check.mjs` (exit 0), `commercetools connect validate` (if B in place).
- [ ] 21.4 Chrome scenarios E2E-P-01 .. E2E-P-16 pass; evidence saved; list failures with the exact network/console excerpt.
- [x] 21.5 `openspec validate p-mc-app-chat-surface --strict`.

## 22. Docs to update (for change W)

- README "Using the assistant": empty state, sessions, tool menu, follow-ups, feedback, preview/annotations, pages; include screenshots from `plans/evidence/P/`.
- docs/api.md: the endpoints and envelopes the chat uses (list in design.md Explore findings 1) and the `data-ct-annotations` part contract.
- docs/architecture: chat data flow (composer -> forwardToFetch -> stream -> useChat), digest polling, stale-session recovery.
- docs/privacy: Gravatar request (Q-P3).
- docs/motion: reuse `mc-app/src/motion/README.md`.
- FEATURES.md regeneration: remove team panel, workspace prefetch, client tools; add annotations.
