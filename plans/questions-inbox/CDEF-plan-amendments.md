> Historical inbox (merged into `plans/owner-questions.md`). Items about `ADMIN_EMAILS`, the Identity admin sign-in, verified e-mail, BQ-ID1/OQ-ID* and M25 are SUPERSEDED by the 2026-10-09 decision `ADMIN_USER_IDS` only (see `plans/06-amendments-applied.md` rows 17-18). This folder is not published (change X).

> SUPERSEDED 2026-10-09 (historical inbox): the admin model is now `ADMIN_EMAILS` + a verified e-mail from the Identity admin sign-in; the `assistant-admin`-style permission group, its key override, claim parsing and permission-capture step no longer exist; test users are an admin user and a non-admin user instead of Teams. See `../owner-questions.md` and `../06-amendments-applied.md`. Entries below that mention the old mechanism are retained for history only.

# Plan amendments requested by changes C, D, E, F

Do not apply silently: each item names the file in `plans/` (or a change) that should be updated and why. Evidence is in the change `design.md` named in brackets.

## For `plans/02-target-architecture.md` (and change B `b-connect-skeleton`)

1. **Service config keys (section 2 table).** Replace the service's key list by the registry in `openspec/changes/c-service-foundation/design.md` ("Env-key registry"). Differences vs the table: `CTP_REGION` is a `standardConfiguration` key (not inherited; Connect injects only `CTP_API_URL, CTP_AUTH_URL, CTP_CLIENT_ID, CTP_PROJECT_KEY, CTP_CLIENT_SECRET, CTP_SCOPE` when `inheritAs.apiClient` is set - those must NOT be declared again) [C P4]; `CLOUD_IDENTIFIER` is dropped for the service (derived from `CTP_REGION`; optional override `MC_CLOUD_IDENTIFIER`); new keys `MC_APP_ENTRY_POINT_URI_PATH` (must equal the mc-app `ENTRY_POINT_URI_PATH`), optional `ADMIN_PERMISSION_KEY`, secured `ENCRYPTION_KEY` (32-byte base64) and optional `ENCRYPTION_KEY_PREVIOUS`, `PERSISTENCE_CONCURRENCY`, `SETTINGS_CACHE_TTL_MS`, `GEMINI_AGENT_MODEL_NAME`, `GEMINI_IMAGE_MODEL_NAME`, `GEMINI_LITE_THINKING_LEVEL`, `GCP_PROJECT_ID` (optional, default from the key). `MC_AUTH_DISABLED` and `PERSISTENCE_DRIVER` must never appear in `connect.yaml`. `MC_AUDIENCE` is optional at boot [C D2, D D2].
2. **Service `package.json`/lockfile rule.** Connect uses Yarn if a `yarn.lock` exists at the repository root, otherwise npm; Node 22 or 24 only [C P1]. The plan's "no npm workspaces root" stays; the service uses npm with `package-lock.json`.

## For `plans/00-overview.md`

3. **D8 wording.** "Connect forwards it to `MC_AUDIENCE`" is not backed by the docs. `CONNECT_SERVICE_URL` is documented only for `postDeploy`/`preUndeploy` scripts; the runtime audience must be set by the operator with a redeploy (`--configuration MC_AUDIENCE=<origin>`). Spec U should own this two-phase step [D P3].
4. **D4 snippet.** `createVertex({ googleAuthOptions: { credentials } })` is valid (`createVertex` is an alias of `createGoogleVertex` in `@ai-sdk/google-vertex@5.0.108`), but note the express-mode trap: `GOOGLE_VERTEX_API_KEY` in the environment makes the provider ignore the service account; the service refuses it [F V1-V2].

## For `plans/03-spec-dependency-map.md` (contracts table)

5. **`getModel`** has four tiers: `'main' | 'agent' | 'lite' | 'image'` (`agent` = legacy `gemini.ts` profile used by the Algolia/Stripe/export/Contentstack agents) plus `getProviderOptions(tier)` and `countTokens`; `getGoogleCredentials()` unchanged [F D3].
6. **`RequestUser`** is `{ userId, projectKey, permissions[], isAdmin }`; D also publishes `AuthenticatedRequest`, `isOwner`, `registerBootstrapContributor` (G, I register `workspace`, `toolCallLogs`, `identityMcpConfigured`, `identityUserConnected` contributors for `POST /service/auth/session`) and `LEGACY_IDENTITY_QUERY_KEYS` (G's feature-flag parsing must ignore `userEmail`, `userId`, `projectKey`) [D D6].
7. **Persistence** (`plans/05` "Repository interface"): stores are implemented once over an `ObjectGateway` with a Custom Object backend and an in-memory backend, instead of two full implementations per store; the seven store interfaces are as in the plan and are the stable contract [E D1, Appendix B]. `TokenStore` also owns PKCE auth states; `claimAuthState` outcomes are `claimed | unknown | expired` (legacy `reused` merged into `unknown`; I must log both as "not found or already used") [E D7].
8. **Cache layer ownership.** C ports only the generic cache (`cache.types`, `memory-cache`, `index`). `cache/mcp-tools.cache.ts` (436 lines, MCP specific) is ported by the first consumer spec (I/J) and reads TTLs from `AppConfig.cache`; `utils/region.ts` MCP URL helpers (`managedMcpUrl`, `auth2Url`, `isCommercetoolsAuthHost`) move to spec I [C D8].
9. **Session ownership:** G's `loadSession` must call D's `isOwner` and answer **404** (not 403) for a session owned by someone else.

## For `plans/05-data-persistence.md`

10. **Verified limits (replace "Caveats" 1-5 with facts):** JSON document <= 16 MB (recommended average 100 KB, "should not exceed 2 MB"), request body <= 14 MB, `sort` only on `container|key|createdAt|lastModifiedAt`, `limit` <= 500, `offset` <= 10000, `value(...)` predicates allowed but unvalidated, input variables recommended, **`null` members in `value` are not saved**, 409 on stale `version` and on concurrent writes even without a version, no documented platform-wide rate limit (retry 502/503 with backoff), strong read-after-write per resource [E P1-P11].
11. **Container/key charset (caveat 3) is NOT confirmed by the current docs** (no pattern in the OpenAPI/type pages). The plan's `[-_~.a-zA-Z0-9]`, 2-256 is treated as an assumption, enforced client-side as `^[A-Za-z0-9_.~-]{1,256}$` and verified by a live probe [E P12].
12. **Data model table corrections:** messages: key = message id (not `{ts}-{messageId}`), ordering by platform `createdAt`, value stores `partsJson` as a string to preserve `null`; feedback snapshots container is `ai-assistant-feedback-snap-<feedbackId>` with chunks of 512 KiB (not 800 KB); suggestions and identity tokens keyed by user id; MCP configs keyed by provider and **encrypted** (legacy stored them in plaintext); auth-state key is `sha256hex(state)`; sessions and feedback records carry `userId` (+ optional display-only `userLabel`) instead of `userEmail` [E D2-D9, Appendix A].
13. **Retention** statement stands; E exposes `SessionStore.listAll`, `deleteSessionCascade`, `TokenStore.sweepExpiredAuthStates` and a purge script as hooks for a future job application.

## For `plans/01-source-inventory.md`

14. Row "Admin allowlist + `?userEmail=` trust": also removes `validateUserEmail`; feedback/backoffice **filters by submitter e-mail become `userId` filters** (spec N must change its filter parameter from `authorEmail` to `authorUserId`) [D, E].
15. Row "Boot-time config audit": additionally the service refuses to start when `MC_AUTH_DISABLED=true` or `PERSISTENCE_DRIVER=memory` and `NODE_ENV` is `production` (the Connect default because `NODE_ENV` is unset) [C].

## For `plans/manual-steps.md`

16. See `CDEF-manual-steps.md` (CM1-CM4) for refinements of M3, M5, M9, M10.
