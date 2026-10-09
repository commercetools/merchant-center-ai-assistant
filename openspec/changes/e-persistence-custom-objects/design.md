## Context

Plan `05-data-persistence.md` decided "Firestore is not needed; use Custom Objects" but explicitly demanded that the limits be **verified, not assumed**, before the data layout is fixed. This document records the verification (Explore findings), then the layout and machinery that follow from the facts. The service has no other state: everything here must be correct with N instances, scale-to-zero, and concurrent requests.

## Explore findings

Verified 2026-10-08 against the commercetools documentation (fetched markdown sources) and by reading the legacy code. `L:` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`.

### Platform facts about Custom Objects (all URLs are `https://docs.commercetools.com/...`)

| # | Fact | Source | Consequence |
|---|---|---|---|
| P1 | A Custom Object is `{id, version, createdAt, lastModifiedAt, container, key, value}`; `value` is any JSON; **`null` members of `value` are not saved**. | `/api/projects/custom-objects.md` (CustomObject / CustomObjectDraft type definitions via `/search.md?urn=ctp:api:type:CustomObject`) | Anything that must keep `null` (tool outputs, message parts) is stored as a JSON **string** (`partsJson`, snapshot `payload`). Mappers must treat absent == null. |
| P2 | **JSON documents persisted through any endpoint must not exceed 16 MB** (hard; `ResourceSizeLimitExceeded`); the platform recommends an **average of ~100 KB** and says large documents "should not exceed 2 MB". Request body limit **14 MB**. | `/api/limits.md#json-document-size`, `#request-body-size` | One message per object; feedback chunks 512 KiB; hard guard 6 MiB per object, soft warning 1 MiB. The legacy 800 KB Firestore chunk is no longer forced by the store but we keep chunks small because of the 100 KB/2 MB guidance and to bound memory. |
| P3 | Max **20 000 000** Custom Objects per project (soft limit, increasable). Object-per-message is affordable: 1 000 sessions x 100 messages = 100 000 objects. | `/api/limits.md#custom-objects`, `/api/projects/custom-objects.md` | No need to pack messages into pages. Re-evaluate if retention (Q13) stays "unbounded" for a very busy project. |
| P4 | Query per container: `GET /{projectKey}/custom-objects/{container}`. **`sort` only by `container`, `key`, `createdAt`, `lastModifiedAt`**. `where` may use `id`, `key`, `version`, `createdAt`, `lastModifiedAt`; **`value(...)` may be used "but is not checked for validity"** (e.g. `value(exampleObject(exampleBoolean = true))`). | `/search.md?urn=ctp:api:endpoint:/{projectKey}/custom-objects/{container}:GET` | No sorting by value fields; lists are ordered by platform timestamps or key. Filters on value fields are allowed but unvalidated (typos silently match nothing) - hence the structured filter model. |
| P5 | `limit` 0..500 (default 20); `offset` max **10000**; `total` with a predicate is capped at the max offset; `withTotal=false` is faster. URL + headers must be under ~15 KB. | `/api/general-concepts.md#limit`, `/api/limits.md#queries`, `#url-and-headers-size` | Pages of 500; cap lists at 10 000 items and fail loudly beyond; `keyIn` limited to 50 keys per request. |
| P6 | **Input variables**: `where=... :name` with separate `var.name=` query parameters (alphanumeric names); recommended to shorten URLs and keep identical use-cases identical in logs. Datetimes in predicates are quoted literals (`createdAt > "2022-08-01T00:00:00.000Z"`). | `/api/predicates/query.md#input-variables`, examples in the same page | All string comparisons use variables (no escaping bugs, no injection); time filters use validated ISO literals. |
| P7 | Query performance: "indexes are managed automatically", dynamic indexes appear only after significant query volume and "can take up to two weeks"; **inefficient patterns include negations (`is not defined`, `!=`), `not in`, `in` with > 50 values, nested array fields**; efficient: equality, time ranges, sorting on the filter field. | `/api/predicates/query.md#performance-considerations` | `value(userId = ...)` is an unindexed-at-first equality: acceptable at the expected scale but benchmarked (risk R1). Feature-flag filtering with negations is done in memory. |
| P8 | **Optimistic concurrency**: `POST /custom-objects` with `version` must match the existing object's version; "concurrent updates to the same Custom Object return a `ConcurrentModification` error **even if the version is not provided**". `DELETE` accepts `?version=`. HTTP 409 carries `currentVersion`. | `/search.md?urn=ctp:api:endpoint:/{projectKey}/custom-objects:POST`, `...:DELETE`, `/api/errors.md#concurrentmodification` | Every read-modify-write retries on 409 by re-reading (never the SDK middleware, which would re-post a stale body). Single-use claim = delete with version. |
| P9 | Scopes: read = `view_key_value_documents` (or `view_products`/`view_orders`/`view_customers`); write/delete = `manage_key_value_documents` (or `manage_products`/`manage_orders`/`manage_customers`). | endpoint pages above; `/api/scopes.md` lines "view_key_value_documents / manage_key_value_documents" | `inheritAs.apiClient.scopes: [view_key_value_documents, manage_key_value_documents]` is the least-privilege pair (`manage_` implies view; both listed for clarity). Anyone with these scopes in the project can read every Custom Object, hence secrets are encrypted. |
| P10 | **No platform-wide rate limit is documented**; transient `502`/`503` can occur under bursty load; clients must ramp traffic, bound concurrency, retry with exponential backoff and honour `Retry-After`. | `/api/general-concepts.md#client-resiliency` | `PERSISTENCE_CONCURRENCY` default 8, retry policy in the gateway. |
| P11 | **Strong consistency**: each resource offers read-after-write consistency; a `500` write may still have completed. Eventual consistency applies to indexed/derived data (search, discounts). | `/api/general-concepts.md#strong-consistency` | Reads after writes are safe for get-by-key. List-after-write is *assumed* consistent for the standard query endpoint and **probed** (task 7.3). On a 500 from a write, callers re-read before retrying non-idempotent creates. |
| P12 | Container and key **character set**: the plan states `[-_~.a-zA-Z0-9]`, 2-256 chars. **The current published reference pages fetched (types, endpoint pages, OpenAPI via the Knowledge MCP) show no `pattern`/length for `container` and `key`.** | OAS from `commercetools-oas-schemata api-CustomObject` (no constraint); type page above | Not confirmed by the docs: enforced conservatively by `assertSafeName` (`^[A-Za-z0-9_.~-]{1,256}$`) and **probed live** (P-charset). Never assume wider charsets (e-mail, `:`, `/`, space). |
| P13 | A Connect service application has 1 CPU / 512 MB, is stateless, request timeout 5 min, scales to zero in sandbox (~15 s boot). | `/connect/deployment-behavior-and-environments.md`, `/connect/best-practices.md` | Persistence must not need warm caches; large reads must stream in 500-item pages and avoid holding transcripts twice. |
| P14 | Delete returns the deleted object (`200 CustomObject`), a missing object yields 404. Behaviour of two **parallel** deletes is not documented. | DELETE endpoint page | Claim logic accepts 200 as "I won" and 404/409 as "someone else won"; **probed** (P-claim). |
| P15 | The `POST` "create or update" does not document whether `createdAt` is preserved on replace. | endpoint page | Message ordering relies on `createdAt` stability for upserted messages; **probed** (P-created). Fallback if false: message key = `<timestamp13>-<id>` and an index lookup (design D6 fallback). |

### Legacy code facts

- L1. Firestore access is a 2138-line grab-bag of 60 exported functions (full list in the Source map). Session documents carry `projectKey`, `userEmail`, optional `userId`, digest fields, `featureFlags`, `disabledTools`, `temporaryTables`, `metadata` (L: `src/types/chat.types.ts:108-160`). Messages are `{id, parts[], role, timestamp?}` with `timestamp = Date.now()` assigned at write; batch writes use one `Date.now()` per `.map`, so **timestamps tie within a batch** (L: `src/services/chat.service.ts:416-420`) and were ordered by `timestamp` asc.
- L2. Messages were upserted by id (`doc(message.id).set`) and de-duplicated by `hasChatMessagesByIds` (one `get` per id, `Promise.all`) before insert (L: `src/utils/firestore.utils.ts:795-826`, `chat.service.ts:407-422`).
- L3. `deleteChatSession` reads the whole subcollection and deletes it in **one** batch (hits Firestore's 500-write limit on long sessions) (`firestore.utils.ts:538-570`) - the new cascade must page.
- L4. Feedback: parent `feedbacks/{uuid}` + subcollection `snapshot_messages/{index6-chunk3}`; `payload` is a **string slice of `JSON.stringify(message)`** because Firestore rejects nested arrays, `__x__` field names and dotted keys; chunk max 800 000 bytes (Firestore 1 MiB document cap), snapshot hard wall 24 MiB; batches flush at 400 writes / 8 MiB; **parent written last, deleted first** (L: `feedback-snapshot.utils.ts:20-40`, `firestore.utils.ts:1335-1410`, `:1538-1600`).
- L5. Identity PKCE state: `createIdentityAuthState` uses `.create()` (fails if exists); `claimIdentityAuthState` is a transaction returning `claimed|unknown|reused|expired`, setting `used=true` **before** the code exchange (claim-first) (`firestore.utils.ts:2019-2088`). Token record: transaction that refuses to overwrite a newer `issuedAt` (`:1956-1978`). Both exist because the OAuth callback can reach a different instance.
- L6. `ENCRYPTION_KEY` is an arbitrary string hashed with SHA-256 to 32 bytes; IV 16 bytes; envelope `{v:1, kind, encrypted, iv, authTag}`; no key id; rotation is a TODO (L: `src/utils/crypto.utils.ts`). **Third-party MCP configs (Contentstack key/token, Stripe secret) are stored in plaintext in Firestore** and merely blanked in API responses (L: `firestore.utils.ts:923-940` `sanitizeMCPConfigForFrontend`, `:943-966`) - this is moot for E: owner decision Q4 moves them out of storage entirely into Connect `securedConfiguration` (read by `readConfiguration()`, change C; consumed by change J).
- L7. Settings lived on the `projects/{key}` document (`systemPrompt`, `toolCallLogs`, `identityMcp`), cached in-process with a TTL and invalidated on writes (`firestore.utils.ts:157-275`, `:1604-1740`, `:1806-1900`). Dates are Firestore `Timestamp`s converted via `.toDate()`.
- L8. `getChatMessageById` (cross-session `collectionGroup`) is only used in `chat.service.ts`; `getChatStats` and `clearAllChatData` are test helpers; `getSessionFeatureFlags`, `getAllProjects`, `deleteProject` are unused outside the file.
- L9. Backoffice list loads **every message of every thread on the page** with a per-row subcollection read (`firestore.utils.ts:1201-1262`) - the new listing separates thread metadata from messages (spec N decides the REST shape).

## Glossary

- **Custom Object**: a commercetools API resource `(container, key) -> JSON value` with a numeric `version`. "Container" is a namespace string, not a separate resource.
- **Container**: here, a naming scope. Creating a container is implicit (first object). Per-session containers are cheap.
- **Version / optimistic concurrency**: every update bumps `version`; sending the version you read makes the write fail with 409 if someone else wrote in between.
- **CAS (compare-and-set)**: the read-modify-write loop built on that 409.
- **Gateway**: our thin wrapper over the Custom Objects endpoints (real and in-memory).
- **Store**: a domain repository (`SessionStore` ...) implemented once over the gateway.
- **Envelope**: JSON holding AES-GCM ciphertext + IV + auth tag + key id.
- **AAD**: additional authenticated data - bound to the ciphertext so a blob copied to another record fails to decrypt.
- **PKCE state**: random value that ties an OAuth callback to the login attempt that started it; single-use.
- **Fact probe**: an integration test that checks a platform assumption.

## Source map

| Legacy (under `.../service/src/`) | New (under `service/src/`) | Verdict |
|---|---|---|
| `utils/firestore.utils.ts` | `persistence/**` (below) | DROP file, REPLACE by stores |
| `utils/crypto.utils.ts` | `crypto/envelope.ts`, `crypto/keys.ts` | CHANGE (12-byte IV, `kid`, AAD, 32-byte base64 key, no legacy layouts) |
| `types/service.types.ts` (`VersionedEnvelope`, `EncryptedKind`, `Identity*`, `Project`) | `persistence/types/*.ts` | CHANGE (`Project` DROP; `Date` -> epoch ms) |
| `types/chat.types.ts` (`ChatSession`, `AiSdkChatMessage`, `UserSuggestions`, ...) | `persistence/types/{session,message,suggestion}.ts` | KEEP shapes, drop `projectKey`/`userEmail` (`userId`, `userLabel`) |
| `types/feedback.types.ts` | `persistence/types/feedback.ts` | KEEP (`userEmail` -> `userId`/`userLabel`, drop `projectKey`) |
| `utils/feedback-snapshot.utils.ts` | chunk maths (`byteLength`, `truncateToBytes`, `snapshotChunkDocId`, `buildSnapshotChunks`, `reassembleSnapshot`) -> `persistence/feedback/chunks.ts`; constants -> `persistence/limits.ts`; `stripInlineDataUrls`, comment/system-prompt caps stay for spec N | CHANGE (`MAX_CHUNK_BYTES` 800 000 -> 524 288) + split between E and N |
| `firestore.indexes.json` | - | DROP (no composite indexes) |
| (new) | `persistence/gateway/{types,custom-object.gateway,memory.gateway,query,errors,retry,concurrency}.ts` | NEW |
| (new) | `persistence/{index,create-persistence}.ts` | NEW |

### Mapping of every legacy `firestore.utils.ts` function

| Legacy function | Replacement | Notes |
|---|---|---|
| `initializeFirestore`, `getFirestoreClient` | `createPersistence(config)` / `getApiRoot()` (spec C) | no client init at import time |
| `mapProjectDoc`, `mapIdentityMcpFromDoc` | `SettingsStore` value codec | dates become epoch ms |
| `invalidateProjectCache` | `SettingsStore` internal cache invalidation | |
| `getProjectByKey` | `SettingsStore.get()` | single project: no key |
| `getAllProjects`, `deleteProject`, `storeProject`, `updateProjectLastAccessed` | **DROP** | tenancy |
| `readSystemPromptFromProject`, `getProjectSystemPrompt` | `settings.get().systemPrompt` | |
| `setProjectSystemPrompt` | `SettingsStore.update(s => ({...s, systemPrompt}))` | CAS |
| `readToolCallLogsFromProject`, `getToolCallLogsConfig` | `settings.get().toolCallLogs` | default `all` |
| `setToolCallLogsConfig` | `SettingsStore.update` | validated enum |
| `getProjectWidgetConfig` | **DROP** | legacy widget (Q7) |
| `stripUndefined` | not needed (JSON round trip drops `undefined`; gateway dev check logs when `null` members are dropped) | |
| `setIdentityMcpConfig` | `SettingsStore.update(s => ({...s, identityMcp}))` | |
| `setIdentityMcpClient` | `SettingsStore.update` touching only `identityMcp.client` | CAS keeps `discovery`/`connectedAt` |
| `clearIdentityMcpConfig` | `SettingsStore.update(s => omit identityMcp)` | tokens untouched |
| `identityTokenDocId` | key = user id | single project, single binding |
| `getIdentityTokenRecord` | `TokenStore.getTokens(userId)` | |
| `setIdentityTokenRecord` | `TokenStore.putTokens(record)` | `'written' | 'stale-ignored'` kept |
| `deleteIdentityTokenRecord` | `TokenStore.deleteTokens(userId)` | |
| `createIdentityAuthState` | `TokenStore.createAuthState` | key = sha256(state) |
| `claimIdentityAuthState` | `TokenStore.claimAuthState` | delete-with-version; `reused` merged into `unknown` |
| `storeChatSession` | `SessionStore.create` | |
| `getChatSession` | `SessionStore.get` | |
| `getSessionFeatureFlags` | **DROP** (unused) | use `get().featureFlags` |
| `updateChatSession` | `SessionStore.update(id, mutate)` | CAS |
| `updateChatSessionTimestamp` | `SessionStore.touch` | best effort |
| `deleteChatSession` | `deleteSessionCascade` | paged, idempotent |
| `getLastChatSessionByProjectKeyAndUserEmail` | `SessionStore.listByUser(userId, {limit: 50})[0]` after flag match | |
| `getAllChatSessionsByProjectKeyAndUserEmail` | `SessionStore.listByUser(userId)` | cap 500 |
| `storeChatMessages` | `MessageStore.put(sessionId, messages)` | sequential, monotonic timestamps |
| `storeChatMessage` | `MessageStore.put(sessionId, [m])` | |
| `getChatMessages(session, limit, offset, order)` | `MessageStore.list(sessionId, {limit, order})` | `offset` param dropped (G uses newest-N + paging by `before`) |
| `countChatMessages` | `MessageStore.count` | `limit=1,withTotal=true` |
| `getChatMessageById` | `MessageStore.get(sessionId, id)` | needs session id; cross-session lookup DROPPED |
| `hasChatMessagesByIds` | `MessageStore.has(sessionId, ids)` | `keyIn` chunks of 50 |
| `deleteChatMessage` | `MessageStore.delete` | |
| `getChatStats`, `clearAllChatData` | **DROP** (test helpers); tests use `purge` script | |
| `storeMCPConfig`, `updateMCPConfig`, `deleteMCPConfig`, `getMCPConfigs*`, `getMCPConfigById`, `getMCPConfigByProvider`, `getEnabledMCPConfigs`, `sanitizeMCPConfigForFrontend` | **DROP** | owner decision Q4: provider credentials are Connect configuration (change C/J), not stored |
| `getBackofficeThreads` | `SessionStore.listAll` + `MessageStore.list` (N composes) | no N+1 inside the store |
| `getBackofficeThreadMessages` | `SessionStore.get` + `MessageStore.list` | |
| `storeFeedback` | `FeedbackStore.put(record, chunks)` | |
| `getFeedbacks` | `FeedbackStore.list` | |
| `getFeedbackById` | `FeedbackStore.get` | |
| `deleteFeedback` | `FeedbackStore.delete` | |
| `userSuggestionsDocId`, `getUserSuggestions`, `setUserSuggestions` | `SuggestionStore.get/set` | key = user id |

## Decisions

### D1. Stores are implemented once on a gateway with two backends (refines the plan's "two implementations")
`05-data-persistence.md` says each store has a `custom-objects/` and a `memory/` implementation. Writing 7 stores twice doubles the surface and lets the in-memory copy drift from production. Instead: one `ObjectGateway` interface, a real and an in-memory backend; stores (and their codecs, ordering rules, CAS, encryption) are written once. Unit tests of consumers can still mock a *store* interface directly. The memory backend deliberately emulates versions/timestamps/JSON round trip, so codec bugs (nulls, dates) surface in unit tests.
- Alternatives: (a) two full implementations - rejected (drift); (b) in-memory fakes per consumer test - rejected (no shared semantics).

### D2. Messages: object per message, container per session
`ai-assistant-messages-<sessionId>`, key = message id, ordered by platform `createdAt`. Facts: P2 (small objects recommended), P3 (20 M objects), P4 (only `createdAt/lastModifiedAt/key` sorting), P5 (500/page), L3 (delete must page). Container-per-session makes "last N", "count", "delete all" container-only queries (indexed, no `value(...)`), and makes cascade delete trivial.
- Alternative A - **single container with `value(sessionId = :s)`**: relies on an unindexed value filter for every chat turn - rejected for the hot path.
- Alternative B - **paged objects (N messages per object)**: fewer objects but updates need CAS over large documents (100 KB guidance exceeded quickly with tool outputs), concurrent turns conflict, partial-page edits rewrite everything - rejected.
- Alternative C - **one object per session holding all messages**: hits the 100 KB/2 MB guidance and 16 MB hard limit on long sessions - rejected.
- Fallback if probe P15 (createdAt stable on replace) fails: key = `<timestamp13>-<messageId>` and `put` first looks up the existing key via `keyIn` on a per-session `id -> key` side object. Not built unless needed.

### D3. Ordering by `createdAt` with sequential writes; `timestamp` in the value
Legacy ties on `Date.now()` within a batch. We write batch members sequentially (one RTT apart, so distinct millisecond `createdAt`) and give each message a strictly increasing `timestamp`; reads sort by `createdAt asc` and re-sort the page by `(timestamp, key)` to break any residual tie. Alternative: client-assigned sequence numbers in keys - rejected (races between tabs).

### D4. `partsJson` string, not structured parts
P1 says nulls are dropped; UI message parts and tool outputs legitimately contain `null`. A JSON string is byte-exact and immune to any server-side value handling. Cost: ~10-30 % size from escaping; acceptable under P2.

### D5. Sessions: single container + `value(userId)` filter (benchmark-gated)
Admin listing across users (backoffice) needs a container-wide list; per-user containers cannot provide it. The filter is an equality on a top-level field. P7 warns about index warm-up; expected scale (tens of users, thousands of sessions) makes it fine, and **task 7.4 benchmarks 5 000 sessions**: p95 under 1 s required.
- Fallback inside `SessionStore` only (interfaces unchanged): maintain `ai-assistant-session-index-<userId>` objects (list of `{id, lastModifiedAt}`) with CAS. Not built unless the benchmark fails.
- Not used: `is not defined`/`!=` predicates (P7); flag filtering happens in memory on <= 500 rows.

### D6. Structured query model instead of predicate strings
P4 says `value(...)` predicates are unvalidated, P6 recommends input variables, P7 warns about patterns. A closed set of filter kinds makes injection impossible, keeps patterns efficient by construction, and lets the in-memory backend implement the same semantics.

### D7. Single-use PKCE claim by delete, not by `used=true`
Firestore needed a transaction; Custom Objects have none. `DELETE ?version=` is a single atomic compare-and-delete (P8, P14). Losing the race yields 404/409 -> `unknown`. We lose the explicit `reused` outcome (a replay now looks like an unknown state); I (identity spec) logs both as "state not found or already used". Alternative: write `used: true` with `ifVersion` and keep a tombstone - rejected: leaves verifier ciphertext around and needs sweeping of used states too.

### D8. Encryption: AES-256-GCM, 32-byte base64 key, kid, AAD
No legacy data exists, so legacy layouts and the "hash any passphrase" derivation are dropped; a weak passphrase becomes a boot failure. IV is 12 bytes (GCM standard; legacy 16 works but is non-standard). AAD binds ciphertext to its record (a blob copied from user A's token object into user B's fails). Rotation: `ENCRYPTION_KEY_PREVIOUS` + `scripts/reencrypt.mjs`.
- Alternative: Google KMS / commercetools-managed secret store - rejected for v1 (extra dependency, plan fixes `ENCRYPTION_KEY` in securedConfiguration).

### D9. Third-party credentials are not persisted (owner decision Q4, supersedes the earlier encrypted-store default)
Legacy stored Contentstack/Stripe keys in plaintext (L6). The owner decided that provider credentials (Contentstack, Algolia, Stripe) are Connect deployment configuration: secrets in `securedConfiguration`, non-secrets in `standardConfiguration` (keys listed in change B; read once by `readConfiguration()` in change C; consumed by change J). Consequently there is **no `McpConfigStore`, no `ai-assistant-mcp-configs` container and no `mcp-config` envelope kind**. `ENCRYPTION_KEY` now protects only identity tokens, PKCE verifiers and the DCR client secret.

### D10. Retry policy split: transport vs. conflict
Transport retries (5xx/429/network, `Retry-After`) live in the gateway; 409 retries live in `updateWithRetry` because the retry must **re-read and re-merge**. The SDK's `concurrentModificationMiddleware` is intentionally not used (it re-sends the old body with a new version - lost-update bug).

### D11. Memory driver is a first-class dev/test mode, never production
`PERSISTENCE_DRIVER=memory` allows `npm run start:dev` with `MC_AUTH_DISABLED` and no commercetools credentials. Spec C already makes `readConfiguration()` refuse it in production.

## Risks / Trade-offs

- R1. **`value(userId)` filter performance** (P7). Mitigation: benchmark gate (task 7.4), fallback index design (D5), time-range pushdown for admin lists.
- R2. **`createdAt` stability / ordering assumptions** (P15, D3). Mitigation: probes 7.3; fallback D2.
- R3. **List-after-write visibility** assumed (P11). Probe; if false, `MessageStore` returns appended messages from the write path and chat reads tolerate a lag.
- R4. **Unknown key/container charset** (P12). Mitigation: conservative validator; probe; ids are UUIDs.
- R5. **Secrets visible to any project member with `view_key_value_documents`**: encrypted, but the ciphertext is readable; key loss = loss of tokens. Document `ENCRYPTION_KEY` backup; rotation script.
- R6. **Large sessions**: >10 000 messages unsupported (offset ceiling) and cascade delete of 5 000 messages takes ~5000/8 x RTT ~ 20-40 s; fits the 5-minute limit but is long. Mitigation: delete is idempotent and re-runnable; no retention job exists (decided 2026-10-09).
- R7. **Write amplification** per chat turn ~ 4-6 requests (2 messages, session touch, digest update, suggestion cache); acceptable with concurrency cap; sandbox cold start adds ~15 s once.
- R8. **No transactions across objects** (feedback parent/chunks, session/messages): handled by ordering rules (parent last on write, first on delete; messages before session on delete) and idempotent re-runs.
- R9. **Retention is unbounded and there is no cleanup job** (Q13, Q25 DECIDED 2026-10-09). Object counts are far from the 20 M limit; privacy implications documented in README; operators can delete explicitly through `deleteSessionCascade` / `FeedbackStore.delete`.
- R10. **Clock**: sweeping uses server `createdAt` (not instance clocks); `expiresAt` comparisons use `Date.now()` of the instance - skew of seconds is irrelevant against 10-minute TTLs.

## Migration Plan

No data migration (owner decision: fresh start). The first write creates containers implicitly. Deleting everything the connector wrote: `node scripts/purge-containers.mjs --prefix ai-assistant-` (requires manage scope; used by tests with a random prefix).

## Open questions

- Q-E1. (Resolved, Q4) Third-party credentials move to `securedConfiguration`; nothing to store here.
- Q-E2. (Resolved 2026-10-09, Q13/Q25) Messages and feedback are kept forever; no retention job.
- Q-E3. Container/key charset and length are undocumented in the current reference (P12): verified live by probe; if the probe shows a wider/narrower set, amend `assertSafeName` (not owner-only).
- Q-E4. Should `createAuthState` sweeping also run from a scheduled Connect `job`? Default no (opportunistic sweep).
- Q-E5. Does the owner want the e-mail kept as a *display label* (`userLabel`) at all? E-mail is not in the JWT; default: optional, client-supplied, display-only (see `plans/decisions.md`, Q6/Q8).

## Integration-test plan (manual step M3)

1. Owner supplies a scratch project + API client (`manage_key_value_documents`, `view_key_value_documents`) in `service/.env.local` (git-ignored): `CTP_PROJECT_KEY`, `CTP_REGION`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL`, `CTP_AUTH_URL`, `ENCRYPTION_KEY`.
2. `npm run test:integration` (script: `node --env-file=.env.local --experimental-vm-modules node_modules/.bin/jest --config jest.integration.config.cjs`). Suites: `tests/integration/probes.spec.ts` (facts P1, P12, P14, P15, P11, charset, 2 MB object, 409, claim race), `tests/integration/contract.custom-objects.spec.ts` (the shared contract suite against the real gateway), `tests/integration/perf.sessions.spec.ts` (`PERF=1` only).
3. Every integration test uses prefix `ai-assistant-it-<random>-` and deletes what it created in `afterAll`; `scripts/purge-containers.mjs` removes leftovers.
4. Results of the probes are copied into the table "Verified on a live project" at the end of this document (amend via `/opsx:update`).
5. Skipped (not failed) when credentials are absent, so CI-less local runs and `commercetools connect application test` stay green.

## Appendix A. Containers and keys (final)

| Container | Key | Value (summary) | Store |
|---|---|---|---|
| `ai-assistant-settings` | `default` | `{schemaVersion, systemPrompt?, toolCallLogs, identityMcp?, updatedAt}` | SettingsStore |
| `ai-assistant-sessions` | `<sessionId>` | session record (see interface) | SessionStore |
| `ai-assistant-messages-<sessionId>` | `<messageId>` | `{v:1,id,role,timestamp,partsJson}` | MessageStore |
| `ai-assistant-identity-tokens` | `<userId>` | `{userId,serverKey,encryptedTokens,accessTokenExpiresAt?,hasRefreshToken,scope?,issuedAt,updatedAt,bindingConnectedAt?}` | TokenStore |
| `ai-assistant-identity-auth-states` | `sha256hex(state)` | `{userId,encryptedVerifier,redirectUri,authorizationServerUrl?,bindingConnectedAt?,createdAt,expiresAt}` | TokenStore |
| `ai-assistant-feedback` | `<feedbackId>` | parent record (metadata + counters, no transcript) | FeedbackStore |
| `ai-assistant-feedback-snap-<feedbackId>` | `<index6>-<chunk3>` | `{index,chunk,chunks,role?,payload}` | FeedbackStore |
| `ai-assistant-suggestions` | `<userId>` | `{suggestions,generatedAt,locale,basedOn}` | SuggestionStore |
| `shared-composed-pages` (external) | `<pageKey>` | owned by spec M | - |

Prefix `ai-assistant` is a constant in `persistence/names.ts`, overridable only by the factory argument `containerPrefix` (integration tests use `ai-assistant-it-<random>`). Longest name: `ai-assistant-feedback-snap-` (27) + 36-char uuid = 63 < 256.

## Appendix B. Interfaces (contract for G, H, I, J, N)

```ts
// persistence/index.ts
export interface Persistence {
  sessions: SessionStore; messages: MessageStore; settings: SettingsStore; tokens: TokenStore;
  feedback: FeedbackStore; suggestions: SuggestionStore;
}
export function createPersistence(cfg: AppConfig, opts?: { gateway?: ObjectGateway; containerPrefix?: string }): Persistence;
export function deleteSessionCascade(p: Persistence, sessionId: string): Promise<boolean>;

export interface SessionRecord {
  id: string; userId: string; userLabel?: string; createdAt: number; updatedAt: number;
  title?: string; description?: string; icon?: string; summary?: string;
  nextPrompts?: NextPrompt[]; digestUpdatedAt?: number;
  featureFlags?: FeatureFlags; disabledTools?: DisabledTools; temporaryTables?: TemporaryTable[];
  metadata?: Record<string, unknown>; schemaVersion: 1;
}
export interface SessionStore {
  create(s: SessionRecord): Promise<void>;                               // ConflictError if exists
  get(id: string): Promise<SessionRecord | null>;
  update(id: string, mutate: (cur: SessionRecord) => SessionRecord | typeof SKIP): Promise<SessionRecord>; // CAS, NotFoundError
  touch(id: string): Promise<void>;                                      // best effort
  listByUser(userId: string, o?: { limit?: number; featureFlags?: FeatureFlags }): Promise<SessionRecord[]>;
  listAll(o: { limit: number; offset?: number; userId?: string; createdBefore?: string; createdAfter?: string }): Promise<{ items: SessionRecord[]; total: number }>;
  delete(id: string): Promise<boolean>;                                  // object only; use deleteSessionCascade
}
export interface StoredMessage { id: string; role: 'user' | 'assistant' | 'system'; parts: unknown[]; timestamp: number }
export interface MessageStore {
  put(sessionId: string, messages: Array<Omit<StoredMessage, 'timestamp'> & { timestamp?: number }>): Promise<StoredMessage[]>;
  get(sessionId: string, id: string): Promise<StoredMessage | null>;
  has(sessionId: string, ids: string[]): Promise<Set<string>>;
  list(sessionId: string, o?: { limit?: number; order?: 'asc' | 'desc' }): Promise<StoredMessage[]>; // always returned chronologically
  count(sessionId: string): Promise<number>;
  delete(sessionId: string, id: string): Promise<boolean>;
  deleteAll(sessionId: string): Promise<number>;
}
export type ToolCallLogsMode = 'none' | 'thinking' | 'tools' | 'all';
export interface Settings { schemaVersion: 1; systemPrompt: string; toolCallLogs: ToolCallLogsMode; identityMcp?: IdentityMcpBindingRecord; updatedAt: number }
export interface SettingsStore {
  get(): Promise<Settings>;
  update(mutate: (cur: Settings) => Settings | typeof SKIP): Promise<Settings>;
}
export interface TokenStore {
  getTokens(userId: string): Promise<IdentityTokenRecord | null>;
  putTokens(r: IdentityTokenRecord): Promise<'written' | 'stale-ignored'>;
  deleteTokens(userId: string): Promise<void>;
  createAuthState(r: IdentityAuthStateRecord): Promise<void>;
  claimAuthState(state: string): Promise<{ outcome: 'claimed'; record: IdentityAuthStateRecord } | { outcome: 'unknown' } | { outcome: 'expired'; ageMs: number }>;
  sweepExpiredAuthStates(o?: { olderThanMs?: number; max?: number }): Promise<number>;
}
export interface FeedbackStore {
  put(record: FeedbackRecord, chunks: FeedbackSnapshotChunk[]): Promise<void>;
  list(f: FeedbackListFilters, limit: number, offset: number): Promise<{ items: FeedbackListItem[]; total: number }>;
  get(id: string): Promise<FeedbackWithSnapshot | null>;
  delete(id: string): Promise<boolean>;
}
export interface SuggestionStore { get(userId: string): Promise<UserSuggestions | null>; set(userId: string, v: UserSuggestions): Promise<void> }

// persistence/gateway/types.ts
export interface StoredObject<V = unknown> { id: string; version: number; container: string; key: string; value: V; createdAt: string; lastModifiedAt: string }
export type ObjectFilter =
  | { kind: 'valueEquals'; path: string; value: string | number | boolean }
  | { kind: 'keyIn'; keys: string[] }                       // <= 50
  | { kind: 'time'; field: 'createdAt' | 'lastModifiedAt'; op: '<' | '<=' | '>' | '>='; iso: string };
export interface ObjectQuery { filters?: ObjectFilter[]; sort?: { field: 'createdAt' | 'lastModifiedAt' | 'key'; dir: 'asc' | 'desc' }; limit: number; offset?: number; withTotal?: boolean }
export interface ObjectGateway {
  get(container: string, key: string): Promise<StoredObject | null>;
  put(container: string, key: string, value: unknown, o?: { ifVersion?: number }): Promise<StoredObject>;
  delete(container: string, key: string, o?: { ifVersion?: number }): Promise<StoredObject | null>;
  query(container: string, q: ObjectQuery): Promise<{ results: StoredObject[]; total?: number }>;
}
// errors: NotFoundError, ConflictError, TooLargeError, InvalidIdError, QueryLimitError, UnavailableError (all extend PersistenceError)
```

Controllers map `NotFoundError`->404, `InvalidIdError`->404, `ConflictError`->409, `TooLargeError`->413, `UnavailableError`->503 through a single `mapPersistenceError` in the error middleware (task 6.2).

## Appendix C. Verified on a live project

_To be filled by task 7.5 after the first integration run (amend via `/opsx:update e-persistence-custom-objects`)._ Columns: probe id, assumption, result, date, project region.

## Changelog

- 2026-10-09 (owner decision Q4): removed `McpConfigStore`, container `ai-assistant-mcp-configs`, the `mcp-config` envelope kind, the third-party-config requirement of `secret-storage`, task 5.3 (tasks 5.4/5.5 renumbered 5.3/5.4) and the reencrypt handling of mcp configs. Provider credentials are Connect configuration (B, C, J).
- 2026-10-09 (Q13, Q25 decided): removed every retention-job reference (R6, R9, Q-E2, proposal out-of-scope, docs); messages and feedback are kept forever with no cleanup job.
- 2026-10-09 (owner decision: admin by user id): administrators come from `ADMIN_USER_IDS` (change C/D) and nothing about admin status is persisted; the `TokenStore` therefore has only token records and PKCE states, the settings record has no admin-sign-in slot and there is no extra encrypted record kind. Feedback tasks are numbered 5.3 and 5.4.
