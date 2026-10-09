## Context

Change P of the A-to-Z plan. It ports the mc-app chat surface on top of O's foundation (auth gate, forward-to,
config). It consumes the REST contract authored by G (sessions, messages, tools, digest, suggestions,
tool-call-logs, feedback) and H (stream). At authoring time `openspec/changes/g-*` and `h-*` do not exist, so the
contract below is taken from the legacy router routes (`/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/src/routes/*.ts`) and `plans/01..05`; every deviation from it is an open question.

## Explore findings

`L/` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src`. Legacy HEAD `e5626a0`.

1. **Endpoints used by the chat** (all relative to the endpoint URL, through `/proxy/forward-to`; `hooks/use-chat-service-connector/use-chat-service-connector.ts`): `POST session`, `GET session` (last), `GET session/all`, `GET|PUT|DELETE session/:id`, `GET session/:id/messages`, `GET|PUT session/:id/tools`, `GET session/:id/digest?since=`, `GET suggestions?locale=`, `POST ai-chat/:id/message/stream?locale=`, `GET|PUT tool-call-logs`, `POST feedback/submit`. Router route files confirm: `routes/session.route.ts` (`/`, `/all`, `/:sessionId`, `/:sessionId/digest`, `/:sessionId/messages`, `/:sessionId/tools`), `suggestions.route.ts`, `ai-chat.route.ts` (`/:sessionId/message/stream`). Note the router also exposes `POST /:sessionId/tools` (`getSessionToolsMergedWithMCP`) - the frontend uses `GET`.
2. **Every call appends `userEmail`** (about 20 call sites in the connector, plus `contexts/session.tsx`, `new-chat/index.tsx` stream URL, `use-suggestions`, `use-next-prompts`). Target (plans/01 "Session ownership by userId / userEmail: verified userId only; drop trusting ?userEmail=") removes it. `useCurrentUser()` remains for display (greeting, avatar, Gravatar).
3. **Bootstrap `workspace` seeding** is used by `contexts/session.tsx` (initial session), `use-chat-connector.ts` (initial messages) and `use-next-prompts.ts` (seeded digest). O removed `workspace` from the bootstrap, so these three lose their shortcut branches; the fallback paths already exist and are the code path to keep.
4. **Stream wiring** (`new-chat/chat-area.tsx` lines ~96-155): `useChat({ id: sessionId, messages: initialMessages, sendAutomaticallyWhen, onError, onFinish, transport: new DefaultChatTransport({ api: url, prepareSendMessagesRequest -> { message: last, id }, fetch: forwardToFetch }) })`; `MAX_RETRIES = 2` with `RETRY_DELAY_MS * attempt`; `onFinish` -> `onTurnFinished()` + `refreshSessions()`. `ai` is pinned `7.0.92`, `@ai-sdk/react` `^4.0.95`.
5. **Dead stub**: `new-chat/tools/index.ts` sets `CLIENT_TOOLS: string[] = []`; `utils/tool-call.ts#hasClientSideToolCallsPending` therefore never fires (FEATURES.md "Stubbed" section; the router has no `ask_confirmation`). `SUBAGENT_TOOLS` lists nine names incl. `bigquery`; `humanize-tool.ts` maps `bigquery` to "Queried the analytics warehouse" (the service keeps BigQuery offload in L).
6. **Layout**: the shell is `NewChat` (`new-chat/index.tsx`) = `AppRail` + `InteractiveTabContent` (Assistant / Preview / Code, with `ChatArea` always mounted) + four drawers (`DrawerId = 'chats' | 'pages' | 'mcp' | 'config'`). Q owns `mcp` and `config`.
7. **Performance decisions embedded in legacy code and worth keeping**: suggestions and next-prompts are requested from `NewChat`, not from the components that display them, so the requests overlap the session/message reads (comment in `new-chat/index.tsx`); the session id is adopted without a validation round trip and a 404 on messages triggers recovery (`session.tsx#resolveStaleSession`, guarded by `recoveredIds`); the feedback snapshot is read from a render-time ref (`chat-area.tsx messagesRef`) so a submit racing the last token captures the latest messages.
8. **Annotation feature** (legacy commits `4089468` "feat: add annotation functionality to preview component", `e5626a0` "implement annotation functionality with structured message parts"): `components/preview-annotations/` (`preview-annotations.tsx`, `annotate-toggle.tsx`, `agentation-shadow-root.ts`, `seed-agentation-defaults.ts`, `use-agentation-theme.ts`, `use-annotation-scope.ts`, `use-feedback-mode-sync.ts`, `build-annotation-payload.ts`, `annotation-payload.ts`), `new-chat/parts/annotations-part.tsx`, `contexts/session.tsx#queuePrompt`/`pendingPrompt`, `chat-area.tsx` consuming `pendingPrompt` (`autoSend`, `parts`), and `babel-renderer` tagging components with `data-ct-component`. It is complete in source: the part type is `data-ct-annotations`; `annotation-payload.ts` states the **mirrored contract** with the router file `service/src/functional-agent/annotation-part.ts` and that `processMessagesForStorage` must let the part through. Dependency `agentation` pinned `3.1.2`. Agentation persists settings in `localStorage` (`seed-agentation-defaults.ts`). Target service changes belong to G/H: accept and persist `data-ct-annotations`, convert it for the model.
9. **Composed pages inside mc-app**: custom objects in container `shared-composed-pages` (`constants.ts`), four GraphQL documents under `hooks/use-composed-pages-connector/*.ctp.graphql`, storage hook (459 lines), `ComposedPagesProvider` (244), `data-sources-context` (478; contains the `BIG_QUERY` legacy guard at lines ~185/344), `page-renderer` (283), `utils/babel-renderer.tsx` (1294; scope `IMPORT_MAP`; tags components for annotations), `ui-error-boundary` (400, class component with `resetKey`/`onError`), `types/composed-page.ts` (schema v5.0 + legacy; includes `mutation` actions - hence manage scopes), `utils/schema-helpers.ts` (identical in composed-apps), `components/composed-page-chart` (Google Charts). The `generate-nimbus-surface` output is consumed by the renderer (O ports the generator).
10. **Third-party request**: `utils/gravatar.ts` sends a SHA-256 hash of the user's e-mail to `www.gravatar.com` (documented in the file). CSP allows `*.gravatar.com`. Open-source consequence: see Q-P3.
11. **Counts**: 77 `console.*` calls in `mc-app/src` (incl. `console.log('Created new session')`). Task 1.4 removes them in ported files; where a message is useful for users use an in-UI error.
12. **FEATURES.md vs code**: FEATURES lists `left-panels/`, `input-area.tsx`, `file-attachment.tsx`, `tool-part.tsx`, `floating-actions-panel`, `team-mcp-panel` - none exist at HEAD (renamed to `shell/*`, `composer/*`). Use the file list in this design, not FEATURES.md.
13. **UI library**: Nimbus `@commercetools/nimbus` ^3.5.1 (`Drawer`, `Toolbar`, `ChatMessageList`, `Markdown`, `Accordion`, `Avatar`), icons `@commercetools/nimbus-icons`. Notes in legacy comments: `Accordion.Header` is the trigger in 3.5.x (no `Accordion.Trigger`); `ChatMessageList` viewport inset is 16px per side (`layout.ts`). Do not "upgrade" these usages.

## Glossary

- **Session**: one conversation (a service-side object) with title/description/icon from the *digest*.
- **Digest**: asynchronous post-turn summary (title, description, icon, summary, next prompts); never awaited by the stream.
- **UIMessage / part**: AI SDK message with typed `parts` (text, reasoning, tool-*, file, source-*, data-*).
- **Subagent tool**: a tool (e.g. `commercetools`) whose output is itself a nested `UIMessage`.
- **Tool-call-logs mode**: `none | thinking | tools | all`: how much reasoning/tool detail the transcript shows.
- **Server tools / switchboard**: per-session list of enabled tools by provider (negative list stored by the service).
- **Composed page**: LLM-authored React page (schema v5.0) stored as a custom object and rendered in the browser.
- **Agentation**: npm package providing the annotation toolbar overlay used on the preview.
- **FLIP transition**: layout animation that moves the composer from centre to bottom (`motion/use-flip-transition.ts`).

## Source map

`L` = `.../mc-app/src`. Verdict KEEP = port with SPDX header and `console.*` removal; CHANGE = listed edit; DROP = not ported. Items owned by Q or O are listed so every directory is accounted for.

| Legacy path (under `L/`) | New path (under `mc-app/src/`) | Verdict | Notes |
|---|---|---|---|
| `components/new-chat/index.tsx` | same | CHANGE | stream URL: only `locale`; no `userEmail`; no `workspace`; drawers `mcp`/`config` mounted by Q |
| `new-chat/chat-area.tsx` | same | CHANGE | drop `userEmail` in feedback calls, drop `sendAutomaticallyWhen`; keep retry + `messagesRef` + `pendingPrompt` |
| `new-chat/{message,message-actions,follow-up-chip,follow-up-chips,thinking-pill,agent-avatar,user-avatar,layout,theme,types}.ts(x)` | same | KEEP | |
| `new-chat/feedback-popup.tsx` | same | CHANGE | `submitFeedback` without email |
| `new-chat/composer/*` (index, attach-button, disclaimer, selected-files, send-button, send-hint, sources-panel, tools-button) | same | KEEP | |
| `new-chat/empty-state/*` (default-suggestions, greeting, index, recent-chat-row, recent-chats, section-label, suggestion-card, suggestion-cards) | same | CHANGE | `default-suggestions.ts` mentions "team": reword; no `userEmail` |
| `new-chat/parts/*` (index, text, reasoning, json-block, file, source, subagent, export, gen-ui, annotations) | same | KEEP | `gen-ui-part` keeps v5-only rule |
| `new-chat/parts/tool-steps/*`, `parts/visualization/*` | same | KEEP | |
| `new-chat/server-tools/{group,tools-panel}.tsx` | same | KEEP | |
| `new-chat/tools/index.ts` | same | CHANGE | drop `CLIENT_TOOLS`; keep `VISUALIZE_DATA_TOOL`, `EXPORT_DATA_TOOL`, `CUSTOM_RENDERED_TOOLS`, `SUBAGENT_TOOLS` |
| `new-chat/typing-indicator/*` | same | KEEP | 16 hard-coded phrases stay (English) |
| `components/shell/app-rail/*`, `conversation-header/*`, `view-tabs.ts` | same | CHANGE | rail items: New chat, Chats, Pages, Help; Q adds Connections and Settings |
| `components/panels/chats-drawer/*` | same | KEEP | |
| `components/panels/composed-page-panel/*` | same | KEEP | |
| `components/panels/settings-drawer/*` | - | see Q | |
| `components/interactive-tab-content/index.tsx` | same | KEEP | |
| `components/code-preview/*`, `compose-preview/*` | same | KEEP | |
| `components/preview-annotations/*` (9 files) | same | KEEP | `build-annotation-message.ts` was removed upstream; do not recreate |
| `components/composed-page-view/{index,composed-page-view,composed-page-settings,messages}.ts(x)` | same | CHANGE | `messages.ts` is unused (dead react-intl): DROP it |
| `components/composed-page-chart/index.tsx`, `page-renderer/index.tsx`, `ui-error-boundary/index.tsx` | same | KEEP | |
| `components/reauthenticate-dialog/*` | - | see O | |
| `components/{managed-mcp,configuration,configure-mcp,backoffice}/*` | - | see Q | |
| `components/entry-point.tsx` | - | see O | |
| `contexts/session.tsx` | same | CHANGE | see Decisions D-P2 |
| `contexts/tool-call-logs-config.tsx` | same | CHANGE | seeded from the optional bootstrap field `toolCallLogs`, else self-fetch on mount; default mode `all` while loading is replaced by `none` until loaded (Q-P2) |
| `contexts/tabbed-header-context.tsx` | same | KEEP | |
| `contexts/compose-preview-context.tsx`, `composed-page-context.tsx`, `composed-pages-context.tsx`, `data-sources-context.tsx` | same | KEEP | data-sources keeps `BIG_QUERY` guard as notice |
| `contexts/{auth,connect,index}.tsx` | - | see O (P appends providers to `AllProviders`) | |
| `contexts/{backoffice-context,mcp-config,system-prompt-config}.tsx` | - | see Q | |
| `hooks/use-chat-service-connector/{index,types,use-chat-service-connector,use-chat-connector}.ts` | same | CHANGE | drop `userEmail` params; backoffice/MCP-config/system-prompt methods are moved to Q's own hook files (task 3.2) |
| `hooks/use-next-prompts.ts`, `use-suggestions.ts` | same | CHANGE | no email, no workspace |
| `hooks/use-graphql/index.ts` | same | KEEP | declares `@commercetools-frontend/sdk` dependency (O) |
| `hooks/use-composed-pages-connector/*.ctp.graphql`, `use-composed-pages-storage/*` | same | KEEP | |
| `hooks/use-chat-service-endpoint`, `use-mc-session`, `use-assistant-admin`, `use-current-user.ts` | - | see O | |
| `hooks/use-managed-mcp/*` | - | see Q | |
| `hooks/use-mc-teams/*` | - | DROP | tenancy |
| `motion/*` (index, presets, tokens, use-flip-transition, use-motion, use-reduced-motion, README.md) | same | KEEP | README.md becomes docs for W |
| `types/chart.ts`, `types/composed-page.ts` | same | KEEP | |
| `types/generated/ctp.ts`, `types.ts`, `helpers.ts`, `test-utils/*` | - | DROP | starter leftovers (O) |
| `graphql.d.ts` | same | KEEP | needed for `*.ctp.graphql` imports |
| `i18n/*`, `load-messages.ts`, `index.tsx`, `constants.ts`, `routes.tsx` | - | see O (P extends `routes.tsx`) | |
| `utils/forward-to.ts` | - | see O | |
| `utils/{session-storage,gravatar,relative-time,material-icons,feedback-payload,schema-helpers,babel-renderer}.ts(x)`, `nimbus-surface.generated.ts` | same | KEEP / see O for generated | `session-storage.ts`: remove `console.warn` |
| `utils/tool-call.ts` | - | DROP | dead stub |
| `utils/mc-api-error.ts` | - | see Q | |

## Decisions

**D-P1. Identity: no `userEmail` on the wire.** The connector builds URLs from the endpoint and ids only. Alternative: keep the parameter as a hint - rejected: D6/plans/01 call trusting it a vulnerability and the service ignores it. If G's final contract still requires it (unlikely), re-add in exactly one place (`withIdentity()` helper) so removal is a one-line change. The browser e-mail is never an identity: the verified identity is the `userId` of the gateway JWT. The one place P still sends an e-mail-shaped value is the display-only `userLabel` in the JSON body of session creation and feedback (D-P1b).

**D-P2. Session bootstrap simplified.** `SessionProvider` order: stored id (adopt, no validation) -> `GET session` (last) -> `POST session`. `workspace` branches removed in `session.tsx`, `use-chat-connector.ts`, `use-next-prompts.ts`. `getAllSessions` runs on provider mount (not seeded). Alternative: ask G for a combined "workspace" endpoint - deferred to Q-P1; measure first paint in E2E-P-01 and only then optimise.

**D-P1b. `userLabel` is display-only.** `POST session` and `POST feedback/submit` MAY carry `userLabel` (the MC user's e-mail from `useCurrentUser()`), body field only, never a query parameter, header or `userEmail`. It is unverified: never used for authorization, keys, filters, ownership or joins (the verified identity is `userId`); the service sanitises it (trim, strip control characters and angle brackets, collapse whitespace, max 120 chars; empty -> absent) and the backoffice renders it as text marked "(unverified)". P has no admin UI of its own; admin-only calls it contains (`setToolCallLogsConfig`) are driven only from Q's settings.

**D-P3. Connector split.** The legacy 692-line connector bundles chat, MCP provider configuration (not ported, owner decision Q4), system prompt, backoffice and feedback list calls. P keeps `use-chat-service-connector.ts` for chat concerns (sessions, messages, tools, digest, suggestions, tool-call-logs, feedback submit) and leaves the rest to Q (`use-admin-connector.ts` etc.). Shared `request()` helper (`forwardToJson` + envelope check) is written once here and reused. Alternative: one big file - rejected (review size).

**D-P4. Tool-call-logs is read by the chat, written by Q's settings.** `ToolCallLogsConfigProvider` stays in P (needed by parts renderers); it fetches `GET tool-call-logs` on mount in parallel with sessions and exposes `showToolCalls`/`showReasoning`; Q's `DetailLevelControl` calls its `setMode/saveConfig`. Until the first response, treat as `none` to avoid flashing reasoning that an admin hid (Q-P2).

**D-P5. Client-side tools removed.** `CLIENT_TOOLS`, `hasClientSideToolCallsPending`, `sendAutomaticallyWhen` are deleted because no service tool is answered by the browser (FEATURES.md "Stubbed"); re-adding is a small change when H defines one. Alternative: keep the empty list - rejected (dead code, R1 asks to keep features, not stubs).

**D-P6. Annotation contract.** `data-ct-annotations` is part of the wire contract with G/H; P keeps `annotation-payload.ts` as the TypeScript source of truth and lists the contract in `docs/api.md` input for W. Alternative: flatten to text - rejected (that was the regression fixed by `e5626a0`).

**D-P7. Composed pages stay reachable from the chat app.** The Pages drawer and `/composed/:pageKey` route are part of the chat surface (rail item with count, "page built for you" highlight via `tabbed-header-context`). `composed-apps` (R) re-uses the same files by copy; drift between `babel-renderer.tsx` copies is accepted and tracked in O's `check-duplicates` manifest only if R decides (R's task).

**D-P8. Keep Gravatar unless the owner says otherwise.** Default: keep (feature), mention in README privacy note; Q-P3 asks. Switch = delete `utils/gravatar.ts` usage in two avatar components and remove `*.gravatar.com` from the CSP (O file).

**D-P9. Port in vertical slices.** Order: connector+session -> shell -> conversation -> parts -> tools -> pages/preview -> annotations; each task keeps `yarn typecheck` green by porting leaf files first, and the placeholder route from O is replaced only in task 13.1.

**D-P10. Own user id is visible to everyone.** Admin is `ADMIN_USER_IDS` membership, so a new operator needs to read their own Merchant Center user id from somewhere that works before they are an admin. The `YourUserId` component (plain text + Copy, fed by the bootstrap `userId`) is mounted in the rail user menu (P) and Settings > About (Q). It is not a secret (the user already sees it in requests) and grants nothing. Alternative: a README instruction to read the id from Merchant Center account settings or DevTools - kept as a fallback only, because it is error-prone.

## Risks / Trade-offs

- **Contract drift with G/H** (field names, envelope `{success,data}`): until G lands, tasks cite the legacy route files; the first task of group 3 is "diff the connector against `docs/api.md` / G's spec" and adjust.
- **XL size**: 60+ tasks. Mitigation: each task compiles; commit per task; group checkpoints (typecheck + build) at the end of each section.
- **`babel-renderer.tsx` is 1294 lines**: port in three tasks (scope/imports, transpile/execute, tagging) and copy rather than rewrite; behaviour is only verified by Chrome (no unit tests).
- **CSP `'unsafe-eval'`** needed by the renderer is a deliberate trade-off (generated code runs in the app origin under the user's session). Document in README; mitigation is the service validating generated code is out of scope here.
- **Third-party Agentation** touches `localStorage` and a shadow root; version pinned; Chrome scenario E2E-P-12 guards regressions.
- **Non-determinism of LLM output**: scenarios assert structure only.
- **Stream limit**: Connect's 5-minute request timeout (D13) can end a long turn; the UI must show the graceful finish message from H, not a crash (E2E-P-02 covers a normal turn; a long-turn scenario is V's).

## Open questions

- **Q-P1**: should G expose a combined session-open endpoint (workspace) for first paint? Default no.
- **Q-P2**: initial tool-call-logs mode while loading (`none`) vs legacy `all`? Default `none`.
- **Q-P3** (owner): keep Gravatar (sends hashed e-mail to a third party)? Default keep, documented.
- **Q-P4**: `POST session` body `metadata` (userAgent, timestamp) - does G still accept it? Default keep sending `title` only.
- **Q-P5**: allowed attachment size/count limits: legacy has none client-side. Default none; H decides.
- **Q-P6**: BigQuery-backed composed-page data sources were removed upstream (`d41704a`); confirm no replacement is planned (M). Default none.
- See `plans/questions-inbox/OPQ-questions.md` for the mirrored owner-facing ones.

## Changelog

- 2026-10-09 (owner decision Q4): MCP provider config types and calls are dropped instead of moved to Q (provider credentials are Connect configuration; Q shows read-only status cards from J's `GET mcp/providers`).
- 2026-10-09 (owner decision Q9): private assistant images are stored as service-relative `/files/{sessionId}/{file}` paths (change L) and cannot be shown with a plain `<img src>`; new task 12.1b adds `hooks/use-service-image.ts` (forwardToFetch -> blob URL, abort on unmount, revoke object URLs, loading/error/retry states, concurrent de-duplication) used by `parts/file-part.tsx`, new requirement "Private images load through the service" and scenario E2E-P-15; the hook is copied by S and reused by Q. Absolute `https://` file URLs (public mode) still render directly.
- 2026-10-09: Admin model changed to `ADMIN_USER_IDS` (service decides from the verified user id; no permission groups): P stays admin-agnostic except for the new read-only `YourUserId` line (task 6.7, spec `mc-user-id-display`, E2E-P-16), `userEmail` is never sent, and the display-only `userLabel` body field was added to session creation and feedback (D-P1b); `setToolCallLogsConfig` is documented as admin-only on the service.
