## Context

Change **G** of the A-Z plan. Needs D (verified `RequestUser`, `requireAdmin`), E (persistence interfaces), F (`getModel`). It is the first spec that touches user-facing data: everything the chat UI lists, reads or configures except the stream itself. Legacy is Firestore + client-asserted email; target is Custom Objects behind interfaces + verified user id.

Interface assumptions (names are the contract in plans/03; exact method names are reconciled with E/D when those changes are applied - see Open questions):

```ts
// from D
type RequestUser = { userId: string; projectKey: string; isAdmin: boolean }; // isAdmin = adminUserIds.has(userId) per change D (user id in ADMIN_USER_IDS, computed synchronously); no permissions[]
// req.user is set by verifyMcSession; requireAdmin(req,res,next) -> 403 { code: 'ADMIN_REQUIRED' } otherwise
// from E (service/src/persistence)
interface SessionStore {
  create(s: SessionRecord): Promise<SessionRecord>;
  get(id: string): Promise<SessionRecord | null>;
  listByUser(userId: string, opts?: { limit?: number }): Promise<SessionRecord[]>; // updatedAt desc
  patch(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord | null>; // merge + 409 retry
  delete(id: string): Promise<boolean>;
}
interface MessageStore {
  appendMissing(sessionId: string, msgs: StoredMessage[]): Promise<StoredMessage[]>; // idempotent by id
  list(sessionId: string, o?: { limit?: number; offset?: number; order?: 'asc'|'desc' }): Promise<StoredMessage[]>;
  deleteAll(sessionId: string): Promise<void>;
}
interface SettingsStore { get(): Promise<Settings>; patch(p: Partial<Settings>): Promise<Settings>; }
interface SuggestionStore { get(userId: string): Promise<UserSuggestions | null>; put(userId: string, v: UserSuggestions): Promise<void>; }
// from F
getModel('lite'): { model: LanguageModel; providerOptions: ProviderOptions }
```

## Explore findings

Facts verified in the legacy code (paths relative to `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`):

1. **Route table of sessions** - `src/routes/session.route.ts`: `POST /` (33), `GET /` (68), `GET /all` (105, `?limit=` L116-118), `GET /:sessionId` (150), `GET /:sessionId/digest` (198), `PUT /:sessionId` (241), `DELETE /:sessionId` (283), `GET /:sessionId/messages` (323), `POST /:sessionId/tools` (398, comment says GET), `PUT /:sessionId/tools` (404). The tools menu is a **POST** in code although its comment says GET; the client therefore calls POST. New contract exposes GET and keeps POST as alias (spec rows 11/12).
2. **Messages route silently swaps sessions**: `session.route.ts:345-352` - when the session's flags do not match the request flags, it answers with the *last matching session's* messages. Kept for compatibility (spec scenario "Messages of a mismatching session"); flagged as Open question OQ-G3.
3. **Identity trust**: every session route uses `validateUserEmail` (`middleware/user-email.middleware.ts`) and ownership compares `session.userEmail !== userEmail` (`services/chat.service.ts:30-37`); `userId` is only a secondary check in `middleware/session.middleware.ts:48-63`. Target: `userId` only (plans D6).
4. **Error semantics are inconsistent**: ownership failure throws inside `ChatService`, wrapped to `Error('Session retrieval failed')` (`chat.service.ts:112-120`) -> route answers 500; `loadSession` middleware answers 403. New: 404 for both (spec "Ownership and isolation").
5. **Feature flags**: `middleware/feature-flags.middleware.ts:12-18` reserves `userEmail, limit, offset, projectKey, userId`; any other query key becomes a flag (`:24-41`). `since` and `locale` are NOT reserved, so `GET /digest?since=1` and `GET /suggestions?locale=de` do not run through that middleware today (they use `sessionMiddleware` only on session routes - `/digest` does, which means `since` becomes a flag but is unused there). New reserved list adds `since`, `locale`.
6. **List fallback**: `chat.service.ts:229-267` - sessions with `digestUpdatedAt` use stored `title/description/icon`; others call `getChatMessages(id, 1, 0, 'asc')` and cut to 50 chars + `...`. Test: `tests/wire/session-summary.spec.ts`.
7. **Digest**: `functional-agent/agents/session-digest.agent.ts` - 20-message window (`:14`), clamps (`:17-23`), 3 follow-ups (`:25`), `clamp` word-boundary at 60% (`:91-99`), transcript-as-one-user-message (`:199-209`, rationale `:183-198`), `AbortSignal.timeout(20_000)` (`:153,210`). `producedAnswer` in `turn-digest.ts:22-37`; detached promise `:71-91`. The view function `services/session-digest.view.ts:25-45`. Tests: `tests/wire/session-digest.spec.ts` (338 lines; normalisation + generation), `tests/wire/turn-digest.spec.ts`.
8. **Digest is started from `onFinish`** of the chat stream (`controllers/ai.chat.controller.ts:305-311`), after `sendMessages(...)` (fire-and-forget too, `:290-299`). H keeps that call site; G provides `runTurnDigest`.
9. **Suggestions**: `services/suggestions.service.ts` - TTL 24 h (`:15`), history depth 5 (`:18`), four static defaults (`:31-57`), freshness rule (`:74-85`), try/catch returns defaults (`:152-158`). Agent `agents/suggestions.agent.ts` - timeout 15 s (`:13`), clamps (`:15`), `normaliseSuggestions` (`:132-148`). Tests: `tests/wire/suggestions.spec.ts` (3 describes: cache freshness, normalisation, prompt).
10. **Tools menu**: `controllers/tools.controller.ts:81-165` builds groups: commercetools (live from identity MCP, `:45-76`), knowledge (constant list), contentstack/algolia/stripe only when enabled (configured through Connect deployment configuration, owner decision Q4). `PUT` stores negatives (`:217-229`). `services/tools.service.ts:83-90` drops descriptions (169 KB payload finding in the comment `:72-79`). In the target the groups come from the ToolSource registry (H); constant tool lists (`constants.ts:30-107`) move to the sources that own them (J), not G.
11. **Settings**: `system-prompt.controller.ts` and `tool-call-logs.controller.ts` read `req.project` (loaded by `validateProject`) and write via Firestore helpers; **no admin gate on PUT** (`routes/system-prompt.route.ts:18`, `routes/tool-call-logs.route.ts:18`) - any project member can change the prompt for everyone. Target: admin only through `requireAdmin` (hardening; admin = user id in ADMIN_USER_IDS, decided 2026-10-09, Q17). Valid modes `['none','thinking','tools','all']` (`tool-call-logs.controller.ts:61`).
12. **Documented-but-absent flags**: `FEATURES.md` says `FEATURE_SESSION_DIGEST`, `FEATURE_NEXT_PROMPTS`, `FEATURE_SUGGESTIONS` disable the features; `grep -rn FEATURE_ service/src` finds nothing. Not ported; W must not document them.
13. **Dead code in `ChatService`**: `getStats`, `clearAllData`, `getMessage`, `deleteMessage`, `getSessionWithMessages` have no route (the route block is commented out, `session.route.ts:406-483`). Dropped.
14. **Platform facts** (Knowledge MCP, https://docs.commercetools.com/api/limits.md): Custom Object count limit 20 000 000 per project; JSON document limit 16 MB, recommended average 100 KB, large docs <= 2 MB; query max 500 per page, `offset` <= 10 000. These bound the "list all sessions of a user" strategy (Decision D-G4).
15. **Cleanup coupling**: `ChatService.deleteSession` deletes BigQuery temp tables first (`chat.service.ts:359-362, 654-676`). G must not import BigQuery (change L) -> hook registry (Decision D-G6).

## Glossary

- **Session**: one chat conversation of one user; a Custom Object in `ai-assistant-sessions`.
- **Digest**: per-turn LLM summary (title, description, icon, summary, follow-ups) written onto the session after the answer streamed.
- **`onFinish`**: callback of the AI SDK UI message stream (`createUIMessageStream`) that runs after the response is complete; owned by H.
- **Feature flag**: any non-reserved query parameter; only `customView` (base64 Merchant Center URL) is in use. A session created with a flag is only visible to requests carrying the same flag.
- **`disabledTools`**: `Record<group, string[]>`, the *negative* list of tools the user switched off; absence means enabled.
- **ToolSource / ToolMenuProvider**: H's registry of tool providers; `ToolMenuProvider.listMenuGroups(ctx)` is the slice G consumes.
- **Custom Object container**: namespace of Custom Objects (`ai-assistant-sessions`); see plans/05.
- **Envelope**: `{ success, data | error }` JSON wrapper.
- **forward-to**: Merchant Center API gateway that signs a 60 s JWT and forwards the request to the service (verified by change D).

## Source map

| Legacy file (under `.../service/`) | New file (under `service/`) | Verdict |
|---|---|---|
| `src/routes/session.route.ts` | `src/routes/session.route.ts` | CHANGE (no `validateProject/validateUserEmail`, GET tools alias, owner middleware) |
| `src/services/chat.service.ts` | `src/services/session.service.ts` + `src/services/message.service.ts` | CHANGE (stores, userId ownership; drop dead methods) |
| `src/middleware/session.middleware.ts` (`loadSession`) | `src/middleware/load-session.middleware.ts` | CHANGE (userId only, 404) |
| `src/middleware/feature-flags.middleware.ts` | `src/middleware/feature-flags.middleware.ts` | KEEP (reserved list extended) |
| `src/middleware/user-email.middleware.ts`, `project.middleware.ts`, `admin.middleware.ts` | - | DROP (replaced by D) |
| `src/services/session-digest.view.ts` | `src/services/session-digest.view.ts` | KEEP |
| `src/functional-agent/agents/session-digest.agent.ts` | `src/agents/session-digest.agent.ts` | CHANGE (`getModel('lite')`) |
| `src/functional-agent/turn-digest.ts` | `src/agents/turn-digest.ts` | KEEP (calls `SessionService.applySessionDigest`) |
| `src/functional-agent/agents/suggestions.agent.ts` | `src/agents/suggestions.agent.ts` | CHANGE (model via F) |
| `src/services/suggestions.service.ts` | `src/services/suggestions.service.ts` | CHANGE (`SuggestionStore`, `ConnectedSourcesProvider`) |
| `src/routes/suggestions.route.ts` | `src/routes/suggestions.route.ts` | CHANGE |
| `src/services/tools.service.ts` | `src/services/tools.service.ts` | KEEP |
| `src/controllers/tools.controller.ts` | `src/controllers/tools.controller.ts` | CHANGE (groups from `ToolMenuProvider`) |
| `src/controllers/system-prompt.controller.ts`, `tool-call-logs.controller.ts` + routes | `src/controllers/settings.controller.ts` + `src/routes/settings.route.ts` | CHANGE (SettingsStore, admin writes) |
| `src/types/chat.types.ts` | `src/types/chat.types.ts` | CHANGE (drop `projectKey`, validator types, `SendMessageRequest`) |
| `src/constants.ts` (`DIGEST_ICON_NAMES`, `DEFAULT_DIGEST_ICON`) | `src/constants/digest-icons.ts` | KEEP |
| `src/constants.ts` (tool lists, MCP names, `STORABLE_TOOLS`, `SUBAGENT_TOOL_NAMES`) | H / J | not G |
| `tests/wire/session-digest.spec.ts`, `suggestions.spec.ts`, `session-summary.spec.ts`, `turn-digest.spec.ts` | `tests/wire/` same names | KEEP (rewired to in-memory stores) |
| `scripts/backfill-session-digests.ts`, `migrate-session-tools.ts` | - | DROP |
| `src/utils/firestore.utils.ts` (chat parts) | - | DROP (E) |

## Decisions

**D-G1 Identity is `userId` only; no e-mail anywhere.** Ownership compares `session.userId === req.user.userId`. `userEmail` is not stored on sessions and the query parameter is never read (it is listed only in D's `LEGACY_IDENTITY_QUERY_KEYS`, which G imports for the reserved-key list; change D's grep gate allows no other `userEmail` in `service/src`). *Alternatives:* keep email as a secondary check (rejected: unverified); store verified email (rejected: the forward-to JWT carries no email).

**D-G2 Errors: 404 for not-owned.** *Alternative:* 403 (leaks existence of a UUID, marginal) - rejected for simplicity: frontends already treat 404 as "create a new session".

**D-G3 Merge-patch updates.** All session mutations go through `SessionStore.patch` (merge + 409 retry owned by E). *Alternative:* read-modify-write in G (rejected: lost updates between digest and tools PUT, which Firestore's field-level `update` avoided and a whole-object Custom Object write would not).

**D-G4 Listing = fetch all of the user's sessions, filter flags in memory.** Custom Objects cannot sort on `value.*`, so `listByUser` uses `where=value(userId="...")` sorted by `lastModifiedAt desc`, paged by 500 up to a hard cap of 2 000 sessions per request (4 pages; offset cap 10 000 is not reached). `?limit=` truncates after filtering. *Alternatives:* store a per-user index object (rejected: second writer, drift); push flag filter into the predicate (`value(featureFlags(customView="x"))` - unverified syntax, kept as optimisation hint for implementation; fall back to in-memory when unsupported). Risk R-G2.

**D-G5 Digest stays fire-and-forget; it is the *caller's* job not to await.** `runTurnDigest` returns `void` (typed `: void`, lint rule `no-floating-promises` satisfied through `void (async () => ...)()`). A unit test asserts `onFinish` returns before a deferred digest resolves. *Alternative:* a queue/job application (rejected: Connect job type has no trigger-on-demand; adds a second app).

**D-G6 Session cleanup hooks.** `registerSessionCleanupHook(fn: (session) => Promise<void>)`. L registers the BigQuery table dropper at module init. *Alternative:* G imports L's service (rejected: G is implemented before L and must compile alone).

**D-G7 Tools menu through injected `ToolMenuProvider`.** G defines `interface ToolMenuProvider { listMenuGroups(ctx: ToolMenuContext): Promise<MenuGroup[]> }` in `src/services/tool-menu.provider.ts` with a default empty implementation and `setToolMenuProvider()`. H's registry calls `setToolMenuProvider(registry)` at app composition. *Alternative:* G imports H (rejected: circular plan dependency H needs G).

**D-G8 Suggestions' connected sources via `ConnectedSourcesProvider`** (same injection pattern; H wires "enabled non-core sources"). Replaces `getEnabledMCPConfigs` (providers are now deployment configuration, `config.providers`).

**D-G9 Settings are one object, one read per request.** `SettingsService.get()` memoises in the request context (AsyncLocalStorage from C). Admin check via D's `requireAdmin` (service-side `isAdmin` from the verified user id; `x-admin-email`, `userEmail`, `userLabel` are never read). System prompt cap 20 000 chars (new, hardening; legacy had none and feedback truncates at 100 KB). Chosen so the prompt stays far below the 100 KB Custom-Object average recommendation.

**D-G10 Session record shape.** `SessionRecord = { id, userId, userLabel?, title, description?, icon?, summary?, nextPrompts?, digestUpdatedAt?, featureFlags, metadata, disabledTools?, temporaryTables?, createdAt, updatedAt }` (plans/05). API `Session` = the record (no tenant or e-mail fields; `userLabel` is an optional display-only, unverified, sanitised text accepted only from the body of `POST /session`, produced by `sanitizeUserLabel` in `service/src/utils/user-label.ts`, which change N reuses). `updatedAt` mirrors the Custom Object `lastModifiedAt` ordering; stored explicitly as epoch ms because clients compare it with `since`.

**D-G11 REST contract is defined once, here.** The table in `specs/rest-api-contract/spec.md` is the source for `docs/api.md` (W) and for the contract test `service/tests/contract/routes.spec.ts`. Rows owned by H/N/I/J are included so the test can assert the assembled app.

## Risks / Trade-offs

- **R-G1 Digest after the response closes may be throttled or killed** on a serverless runtime that freezes CPU after the response ends (Connect docs: service apps are serverless with processing timeouts, https://docs.commercetools.com/connect/deployment-behavior-and-environments.md). Mitigation: digest has a 20 s timeout, failure only costs freshness (next turn retries, list falls back to first-message title); E2E-G-03 on the sandbox deployment measures it. If it proves unreliable, open an owner question to move the call before stream close with a hard 3 s cap.
- **R-G2 Per-user list size** (2 000 cap): heavy users lose old sessions from the drawer, not from storage. Documented; retention is none (Q13 decided 2026-10-09: sessions and messages are kept forever; only the drawer list is capped).
- **R-G3 Eventual ordering**: `lastModifiedAt` sort of Custom Objects is immediately consistent for the writer's own read in practice; if E documents otherwise, the drawer may briefly lag.
- **R-G4 Admin-only prompt write** changes legacy behaviour: members who used to edit the prompt lose the ability (intended; document in W). Non-admins get 403 `ADMIN_REQUIRED`; the frontends hide the controls using the bootstrap `isAdmin` (UX only).
- **R-G5 Contract drift** with P/Q/S: mitigated by the contract test and by listing response types in `chat.types.ts` which frontends copy.

## Migration Plan

Greenfield (no data migration: legacy Firestore data is not carried over, plans/05). Rollout order: G merged after D/E/F; H consumes `MessageService`/`runTurnDigest`; P/S consume the contract.

## Open questions

- **OQ-G1** Exact E method names (`patch` vs `update`, `listByUser`) - reconcile at apply time; tasks use the names above. (Not owner-only.)
- **OQ-G2** Does F return `{ model, providerOptions }` from `getModel`? Tasks assume yes. (Not owner-only.)
- **OQ-G3** Keep "messages of last matching session on flag mismatch"? Default keep. Owner-visible only if S/P prefer 404 (mirrored as GQ3).
- **OQ-G4** Admin-only system-prompt write (GQ1, now defined as an administrator in `ADMIN_USER_IDS`) and 20 000-character cap (GQ2) - owner may veto; mirrored in `plans/questions-inbox/GHN-questions.md`.
- **OQ-G5** Whether the Custom Object predicate `value(featureFlags(customView="..."))` is accepted by the API - verify during task 3.3 against the scratch project (M3).

## Changelog

- 2026-10-09 (owner decision Q4): REST row 27 changed from `/mcp/configs*` (CRUD) to the read-only `GET /mcp/providers` (change J); tools-menu and connected-sources wording now refers to deployment-configured providers.
- 2026-10-09 (owner decision Q9): route table gains row 28 `GET /files/:sessionId/:fileName` (owner or admin, binary stream, implemented by change L); the response-envelope rule exempts the binary success response; no `resolveStoredFileUrls` / re-signing hook is needed in the message endpoints or history loader (plan amendment PA-L1 is obsolete) - messages carry the relative `/files/...` URL as stored.
- 2026-10-09 (owner decisions Q6/Q17 replaced; admin by user id): admin gating for system prompt and tool-call-log mode writes (and the file route's 'admin') is `requireAdmin` backed by the service-computed `isAdmin` (verified user id in `ADMIN_USER_IDS`); no permissions claim and no `permissions` in `RequestUser`/bootstrap (row 2 is `{ projectKey, userId, isAdmin, identityMcpConfigured, ... }`); non-admin scenarios (403 `ADMIN_REQUIRED`) replace the permission-denied ones; forged-identity scenarios (`x-admin-email`, `userEmail`, `userLabel` grant nothing); ownership stays `userId` only; row 21 filter `authorEmail` became `authorUserId`; retention wording aligned with Q13 (none); optional display-only sanitised `userLabel` on session creation (task 2.3 `sanitizeUserLabel`, former 2.3 became 2.4; task 10.3 forged-identity tests).
