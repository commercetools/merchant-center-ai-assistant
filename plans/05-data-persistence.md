# 05 — Is Firestore still needed? Data model on Custom Objects

## Answer

**No.** Single-tenant removes the reason Firestore existed (per-project documents, cross-tenant queries, per-tenant indexes). Everything left is small, per-project, keyed data that commercetools **Custom Objects** hold natively: *"Custom Objects … frees your application from any third-party persistence solution and means that all your data stays in one place"*. The connector also needs **no extra GCP resource** for state (the Google SA is still needed for Gemini/BigQuery/GCS).

**Verified in spec E (2026-10-08, see `openspec/changes/e-persistence-custom-objects/design.md` P1–P15):** JSON document ≤ 16 MB (guidance: avg 100 KB, ≤ 2 MB); request body ≤ 14 MB; `sort` only on `container|key|createdAt|lastModifiedAt`; `limit` ≤ 500, `offset` ≤ 10000; `null` members inside `value` are **not saved** (store message parts as JSON strings); 409 on stale version; container/key charset is NOT documented (enforce `^[A-Za-z0-9_.~-]{1,256}$` client-side, probe live). Chunk sizes: feedback snapshots 192–512 KiB per spec N/E. Original caveats (kept for context):

1. **Custom Object value size** — check the exact JSON document limit before sizing message storage and feedback snapshots (current Firestore chunk = 800 KB). Chunking strategy is decided from the verified number.
2. **Querying** — Custom Objects are queried per container with `where=value(field="x")`, `sort`, `limit<=500`, `offset<=10000`. Verify which `sort` fields are allowed (`createdAt`, `lastModifiedAt`, `key`, `id`) — **no sorting on `value.*`**. Design every list so it is satisfiable with container + `value(...)` filter + `createdAt/lastModifiedAt` sort.
3. **Container/key charset** — `[-_~.a-zA-Z0-9]`, 2–256 chars. Session ids are UUIDs → safe.
4. **Optimistic concurrency** — use `version` on updates; settings and session metadata writers must retry on 409.
5. **Rate limits** and **eventual deletion**: batch deletes (session + messages) are N calls; implement bounded concurrency.
6. **Scopes** — `manage_key_value_documents` (+ `view_key_value_documents`) via `inheritAs.apiClient.scopes` in `connect.yaml`. This is new for the service: the old router deliberately held *no* commercetools credentials. Least-privilege, documented in the README.
7. **Secrets at rest** — Custom Objects are readable by anyone with `view_key_value_documents` in the project. Anything secret that is stored (identity refresh tokens, PKCE verifiers, the DCR client secret) is **AES-256-GCM encrypted** with `ENCRYPTION_KEY` (securedConfiguration) before storing. Third-party provider credentials (Contentstack, Algolia, Stripe) are **not stored at all**: they are Connect `securedConfiguration`/`standardConfiguration` (owner decision Q4).

## Proposed data model (all containers prefixed `ai-assistant-`)

| Container | Key | Value (summary) | Replaces (Firestore) | Notes |
|---|---|---|---|---|
| `ai-assistant-settings` | `default` | `{systemPrompt, toolCallLogs, identityMcp:{serverKey,url,connectedAt}, identityLogin:{client}, schemaVersion}` | `projects/{key}` doc | one object; optimistic concurrency |
| `ai-assistant-sessions` | `{sessionId}` | `{userId, userLabel?, title, description, icon, summary, nextPrompts[], digestUpdatedAt, featureFlags{}, disabledTools{}, temporaryTables[], createdAt, updatedAt}` | `sessions/{id}` | list by `value(userId=…)` sorted `lastModifiedAt desc` |
| `ai-assistant-messages-{sessionId}` | `{ts}-{messageId}` | AI-SDK `UIMessage` JSON | `sessions/{id}/messages` | container-per-session → "last 20" = `sort=createdAt desc&limit=20`; delete session = list+delete container contents. **Alternative to evaluate:** one object per N-message page. Decide in spec E |
| `ai-assistant-identity-tokens` | `{userId}` | encrypted `{accessToken, refreshToken, expiresAt, scope}` | `mcpIdentityTokens` | AES-GCM |
| `ai-assistant-identity-auth-states` | `{state}` | `{userId, codeVerifier(enc), redirect, expiresAt}` | `mcpIdentityAuthStates` | single-use claim = delete-with-version; **must work across instances** (this is why it cannot be in memory); sweep expired on read |
| `ai-assistant-feedback` | `{feedbackId}` + `ai-assistant-feedback-snapshots` / `{feedbackId}-{idx}-{chunk}` | metadata + chunked snapshot | `feedbacks` + `snapshot_messages` | parent written last (no discoverable half-written record) |
| `ai-assistant-suggestions` | `{userId}` | `{cards[4], generatedAt, locale, basedOnDigestAt}` | `user_suggestions` | cache only; safe to lose |
| `shared-composed-pages` (existing) | `{pageKey}` | page schema v5.0 | already a custom object | unchanged; name decided in spec M |

## Repository interface (spec E)

`service/src/persistence/` exposes small interfaces (`SessionStore`, `MessageStore`, `SettingsStore`, `TokenStore`, `FeedbackStore`, `SuggestionStore`) with **two implementations**: `custom-objects/` (production) and `memory/` (unit tests + `MC_AUTH_DISABLED` local dev). No controller imports the commercetools SDK directly.

## Retention (Q13, Q25 - DECIDED 2026-10-09)

Messages and feedback are kept forever; there is no retention or cleanup job (the docs state this and how an operator deletes Custom Objects). Request/snapshot caps stay 10 MiB / 8 MiB.
