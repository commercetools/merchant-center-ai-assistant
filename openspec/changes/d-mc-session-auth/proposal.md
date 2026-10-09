## Why

Every route the Merchant Center (MC) apps call must prove who the caller is. The legacy router does this correctly for identity (gateway JWT verified against the MC API JWKS) but wraps it in tenancy (`validateProject`, project auto-registration, per-region issuer inference) and in two unsafe habits: **admin = hard-coded e-mail allowlist matched against an unverified `?userEmail=` query parameter**, and **session ownership falling back to that same unverified e-mail**. A public single-tenant connector cannot ship either. This change defines the authentication/authorisation contract (`RequestUser`, `requireAdmin`) the feature specs build on. Owner decision 2026-10-09: admin is an **allowlist of Merchant Center user ids (`ADMIN_USER_IDS`)** matched against the `sub` of the signed gateway JWT; the gateway JWT carries no e-mail and a browser-sent e-mail can be forged, so nothing from the request body, query or headers is ever compared with the allowlist.

- Change ID: **D** `d-mc-session-auth`
- Needs: **C** `c-service-foundation` (Express shell, `AppConfig`, logger, context). Wave 3; runs in parallel with E and F. Consumed by G, H, I, N, O.

## What Changes

- `verifyMcSession` middleware: verifies the MC gateway JWT (RS256, issuer = the project's MC API gateway, audience = `MC_AUDIENCE` origin + request path) and **rejects any `projectKey` different from `CTP_PROJECT_KEY`** (single-project guard, HTTP 403).
- `RequestUser { userId, projectKey, isAdmin }` placed on `req.user` and in the request context; `requireAdmin` middleware (403 `ADMIN_REQUIRED`). `isAdmin` is computed **by the service** synchronously as `ADMIN_USER_IDS` contains the verified `sub`. With `ADMIN_USER_IDS` empty nobody is admin (fail closed, one warning at boot, `adminConfigured:false` on `/status`). No Merchant Center permission group, no `user_permissions` claim, no `includeUserPermissions`.
- `POST /service/auth/session` bootstrap: no project registration; returns `{ projectKey, userId, isAdmin, ...contributions }` where later specs (G, I) add fields through a contributor registry (so D does not depend on them). `userId` is returned so the frontends can show a read-only "Your user ID" line that an administrator copies into `ADMIN_USER_IDS`.
- Session ownership rule: `isOwner(session, user)` compares **verified `userId` only**; `?userEmail=` is no longer read anywhere (legacy identity query keys are ignored and reserved).
- `MC_AUTH_DISABLED` development bypass: identity from `x-dev-user-id` and `x-dev-admin: true` headers, project forced to `CTP_PROJECT_KEY`, **configuration refuses to start in production**.
- Single `auth` config section: `MC_AUDIENCE` (optional at boot, fail-closed per request), `MC_AUTH_DISABLED`, `MC_CLOUD_IDENTIFIER` (optional override), `MC_APP_ENTRY_POINT_URI_PATH`, `ADMIN_USER_IDS` (optional, comma-separated allowlist of user ids).
- Wire tests that exercise the **real** `@commercetools-backend/express` verifier with locally signed JWTs and an msw-served JWKS (the legacy tests mock the library).
- **BREAKING (vs legacy):** `?userEmail=`/`?projectKey=` no longer authenticate or authorise anything; the legacy hard-coded e-mail allowlist matched against client input is replaced by `ADMIN_USER_IDS` matched against the verified `sub` only; `validateProject`, `validateUserEmail`, `validateAdmin` removed.

## Capabilities

### New Capabilities
- `mc-session-verification`: gateway JWT verification, single-project guard, fail-closed behaviour, development bypass guard, ownership by verified user id.
- `mc-admin-authorization`: `ADMIN_USER_IDS` allowlist to `isAdmin`, fail-closed behaviour, `requireAdmin`.
- `mc-session-bootstrap`: `POST /service/auth/session` contract and contributor registry.

### Modified Capabilities
<!-- none -->

## Impact

- New code under `service/src/{middleware,controllers,routes,auth,config/sections/auth.ts,types}`; replaces the placeholder `auth` section from C.
- `connect.yaml` (B): `MC_AUDIENCE` (std, optional), `MC_APP_ENTRY_POINT_URI_PATH` (std), `ADMIN_USER_IDS` (std, optional), `MC_AUTH_DISABLED` must NOT be declared (dev-only, never deployable), optional `MC_CLOUD_IDENTIFIER`.
- Frontends (O): must call through `/proxy/forward-to` with `audiencePolicy: 'forward-url-full-path'` (no `includeUserPermissions`), must stop sending `userEmail`, and must read `isAdmin` only from the bootstrap response.
- Contracts published: `RequestUser`, `AuthenticatedRequest`, `requireAdmin`, `isOwner`, `registerBootstrapContributor`, `parseAdminUserIds`, `isAdminUser`, `LEGACY_IDENTITY_QUERY_KEYS`.

## Out of scope

- The persistence of sessions (E) and the `loadSession` middleware that reads a session and calls `isOwner` (G wires it; D ships the pure rule + test).
- Identity-MCP per-user OAuth (I) - the MC gateway JWT is an identity assertion only and is never relayed to commercetools MCP servers.
- Frontend changes (O, including the "Your user ID" line) and the two-phase deployment that learns the service URL (U).
- Fine-grained per-feature permissions (not in v1): the app's ordinary View/Manage Merchant Center permissions only control access to the app, never admin.

## Legacy source

Read-only, absolute paths under `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`:
- `src/middleware/mc-session.middleware.ts`, `src/controllers/mc-auth.controller.ts`, `src/routes/mc-auth.route.ts`
- `src/middleware/admin.middleware.ts`, `src/middleware/session.middleware.ts`, `src/middleware/user-email.middleware.ts`, `src/middleware/project.middleware.ts` (DROP)
- `src/utils/region.ts`, `src/types/service.types.ts` (`AuthenticatedRequest`)
- `tests/wire/mc-gateway-auth.spec.ts`
- Frontend reference: `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/utils/forward-to.ts`, `src/constants.ts`, `src/hooks/use-assistant-admin/index.ts` (read for contrast only: the new hook reads the bootstrap)
