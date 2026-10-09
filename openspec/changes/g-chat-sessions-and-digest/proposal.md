## Why

The chat UI (changes P, Q, S) needs a stable set of session, message, digest, suggestion, tools-menu and settings endpoints before the agent stream (H) can persist anything. In the multitenant router these live on Firestore and trust a client-supplied `?userEmail=`; in the single-tenant connector they must run on the persistence interfaces from change E and on the verified user from change D.

## What Changes

- **Change ID: G** (`g-chat-sessions-and-digest`). **Needs:** D (auth, `RequestUser`, `requireAdmin`), E (persistence interfaces), F (`getModel('lite')`). Unblocks: H, N, P, S.
- Port session CRUD, last-session, list-all (`?limit=`), paginated messages, and the feature-flag (`customView`) scoping onto `SessionStore` / `MessageStore`. Ownership is by verified `userId`; `?userEmail=` is no longer read for authorisation.
- Port the **session digest** (title, description, icon, summary, up to 3 follow-ups): generation on the lite model, clamping, `producedAnswer` guard, `GET /session/:id/digest?since=` polling, started fire-and-forget (never awaited) from the stream `onFinish` that H owns.
- Port **prompt suggestions** (`GET /suggestions`): per-user cache in `SuggestionStore`, always HTTP 200 with exactly four cards.
- Port the **per-session tools menu**: `disabledTools` negative list stored on the session; the tool listing comes from a `ToolMenuProvider` injected by H's `ToolSource` registry (G ships an empty default so it is testable alone).
- Port **system prompt** and **tool-call-log mode** endpoints onto the single `SettingsStore` object; writes become admin-only through `requireAdmin` (the caller's verified user id is in `ADMIN_USER_IDS`; there is no permission claim and no `permissions` in the bootstrap).
- Publish the **full REST contract table** (G + H + N rows) that frontends P/Q/S rely on; a copy goes to `docs/api.md` in change W.
- **BREAKING (vs. legacy):** no `projectKey`/tenant fields in responses; non-owned sessions answer 404 (was 500/403 mix); `PUT /system-prompt` and `PUT /tool-call-logs` require an administrator listed in `ADMIN_USER_IDS` (403 `ADMIN_REQUIRED` otherwise); `POST /session/:id/tools` gains a `GET` twin (POST kept as alias).
- Dropped: `getStats`, `clearAllData`, `deleteMessage`, `getMessage` (dead code), `migrate-session-tools` and `backfill-session-digests` scripts, the undocumented `FEATURE_SESSION_DIGEST` / `FEATURE_NEXT_PROMPTS` / `FEATURE_SUGGESTIONS` flags (documented in legacy FEATURES.md but not present in code).

## Capabilities

### New Capabilities
- `rest-api-contract`: the authoritative method/path/request/response/auth table for the whole service, and the response envelope.
- `chat-sessions`: session lifecycle, ownership, feature-flag scoping, message listing and append, temporary-table bookkeeping.
- `session-digest`: post-turn summarisation and its polling endpoint.
- `prompt-suggestions`: cached opening prompts, always four cards.
- `session-tools-menu`: per-session tool switches stored as a negative list.
- `assistant-settings`: system prompt and tool-call-log mode in the settings object.

### Modified Capabilities
<!-- none: openspec/specs is empty -->

## Impact

- New code under `service/src/{routes,controllers,services,agents,types}` (paths in design.md Source map).
- New env keys: none (digest/suggestion timeouts are constants; model comes from F).
- Consumers: P (drawer, empty state, composer, tool menu), Q (configuration panel), S (customView sessions), N (session lookup), H (stream persists via `MessageService`).

## Out of scope

- The chat SSE endpoint, orchestrators, tool sources (H, I, J, K, L, M).
- Feedback and back-office endpoints (N).
- Persistence implementations (E) and auth middleware (D) - consumed through their interfaces.
- BigQuery temp-table deletion logic (L registers a session-cleanup hook; G only provides the hook point).
- Retention/auto-deletion of sessions and messages (Q13 decided 2026-10-09: kept forever, no cleanup job).
- The admin determination itself (`ADMIN_USER_IDS` matched against the verified gateway user id, `isAdmin` in `RequestUser`): change D.

## Legacy source

Read-only, under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/`:
`service/src/routes/{session,suggestions,system-prompt,tool-call-logs}.route.ts`,
`service/src/controllers/{tools,system-prompt,tool-call-logs}.controller.ts`,
`service/src/services/{chat,tools,suggestions,session-digest.view}.service.ts` (+ `.view.ts`),
`service/src/functional-agent/{turn-digest.ts,agents/session-digest.agent.ts,agents/suggestions.agent.ts}`,
`service/src/middleware/{feature-flags,session}.middleware.ts`, `service/src/types/chat.types.ts`, `service/src/constants.ts`,
`service/tests/wire/{session-digest,suggestions,session-summary,turn-digest}.spec.ts`, `FEATURES.md` (sections "Sessions, messages and the per-session tools menu").
