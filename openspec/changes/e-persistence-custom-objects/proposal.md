## Why

Single-tenancy removes the reason Firestore existed (plan `05-data-persistence.md`). Everything that must outlive a request or be shared by two Connect instances (sessions, messages, settings, user OAuth tokens, PKCE states, feedback, suggestion cache) must live in commercetools **Custom Objects**, behind interfaces that no controller bypasses. This is the riskiest design in the migration: Custom Objects have different size, query, ordering and concurrency characteristics than Firestore, and the connector's credentials, secrets and instance-safety all depend on getting them right. This change verifies those characteristics against the documentation, fixes the storage layout, and delivers the persistence layer with in-memory test support and a live-project test plan.

- Change ID: **E** `e-persistence-custom-objects`
- Needs: **C** `c-service-foundation` (`AppConfig`, `getApiRoot()`, logger, `CustomError`). Wave 3 (parallel with D, F). Consumed by G, H, I, J, N.

## What Changes

- A thin **ObjectGateway** over the Custom Objects REST API (`get`, `put` with optional `version`, `delete`, `query` with a *structured* filter model that compiles to safe query predicates) with two implementations: `CustomObjectGateway` (production) and `MemoryObjectGateway` (tests, `PERSISTENCE_DRIVER=memory` for local dev only, refused in production).
- Six store interfaces implemented **once** on top of the gateway (`SessionStore`, `MessageStore`, `SettingsStore`, `TokenStore` (incl. PKCE auth states), `FeedbackStore`, `SuggestionStore`) plus `createPersistence(config)` factory and `deleteSessionCascade`.
- Storage layout decided from verified limits: **object-per-message in a container per session**, parsed `partsJson` string for byte-exact fidelity, session metadata in one container queried by `value(userId)`, feedback snapshots chunked at **512 KiB**, all containers prefixed `ai-assistant-`.
- Cross-cutting machinery: optimistic-concurrency read-modify-write helper with bounded jittered retry on HTTP 409, bounded-concurrency batch delete, expired-state sweeping, transient-error retry policy, per-record and per-chunk size guards.
- **AES-256-GCM** envelope encryption (`ENCRYPTION_KEY` 32-byte base64, optional `ENCRYPTION_KEY_PREVIOUS` for rotation, AAD binding to record identity) replacing legacy `crypto.utils.ts`; no legacy layouts.
- Shared **contract test suite** run against the memory gateway always and against a scratch commercetools project when credentials are present (manual step M3), plus *fact probes* that turn every assumption in `design.md` into an executable check.
- Mapping from every legacy `firestore.utils.ts` function to its replacement (design.md) and `scripts/` to purge test containers and re-encrypt after key rotation.
- **BREAKING (vs legacy):** user-email-keyed data (`user_suggestions`, session queries by e-mail) is keyed by verified `userId`; `claimIdentityAuthState` outcome `reused` is merged into `unknown` (single-use by deletion); no data migration from Firestore.

## Capabilities

### New Capabilities
- `object-gateway`: Custom Object access primitive, structured queries, error model, retry, concurrency helpers, limits, memory implementation, contract tests.
- `session-message-storage`: session records, per-session message containers, ordering, cascade delete, admin listing.
- `settings-suggestion-storage`: single settings object with CAS updates, suggestion cache.
- `secret-storage`: encryption helpers, identity token records, single-use PKCE states (third-party provider credentials are NOT stored here: owner decision Q4, they are Connect `securedConfiguration`, see change J).
- `feedback-storage`: feedback records, chunked snapshots, write-parent-last, delete-parent-first.

### Modified Capabilities
<!-- none -->

## Impact

- New `service/src/persistence/**`, `service/src/crypto/**`, `service/src/config/sections/persistence.ts` (replaces C's placeholder), `service/tests/{unit,integration,helpers}/**`, `service/scripts/{purge-test-containers,reencrypt}.mjs`.
- `connect.yaml` (B): `inheritAs.apiClient.scopes: [view_key_value_documents, manage_key_value_documents]` (verified minimum; documented in README), secured `ENCRYPTION_KEY` (required), `ENCRYPTION_KEY_PREVIOUS` (optional), standard `PERSISTENCE_CONCURRENCY` (optional). `PERSISTENCE_DRIVER` must not be declared (test/dev only).
- Downstream: G/H/I/J/N import only the interfaces from `service/src/persistence/index.ts`.

## Out of scope

- Composed-pages object (`shared-composed-pages`, owned by M; it is written by the frontend through the MC API).
- Data migration from Firestore (no existing data is carried over).
- Retention / automatic deletion: decided 2026-10-09 (Q13, Q25): sessions, messages and feedback are kept forever and there is no retention or cleanup job (only the opportunistic sweep of expired PKCE states, which is not retention). Explicit deletion stays available through `deleteSessionCascade` and `FeedbackStore.delete`.
- Redis or any non-commercetools store; cross-instance cache invalidation.
- Which fields feature specs add to their records (G/I/J/N extend value types in the files this change creates; the *mechanism* is fixed here).

## Legacy source

Read-only, absolute paths under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
- `src/utils/firestore.utils.ts` (2138 lines; every function is mapped in design.md)
- `src/utils/crypto.utils.ts`, `src/types/service.types.ts` (envelope, identity types), `src/types/chat.types.ts`, `src/types/feedback.types.ts`
- `src/utils/feedback-snapshot.utils.ts` (chunk maths), `src/services/chat.service.ts` (message write semantics)
- `firestore.indexes.json` (shows which queries needed composite indexes)
- Plan: `/Users/behnam/code/commercetools-labs/ai-assistant/plans/05-data-persistence.md`
