## Context

Change D defines who a request is and whether they may administer the assistant. The MC apps call the service only through the MC API gateway (`/proxy/forward-to`), which injects a short-lived JWT after checking the user's MC session and project access. Everything else (feature specs) depends on `req.user` and `requireAdmin`.

## Explore findings

`L:` = `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/service/`.

**Legacy behaviour**
- F1. `verifyMcSession` builds a verifier with `createSessionAuthVerifier({ audience, issuer, audiencePolicy: 'forward-url-full-path', inferIssuer: true })`, memoised per (audience, issuer) (L: `src/middleware/mc-session.middleware.ts:50-69`); `audience = MC_AUDIENCE`, `issuer = MC_CLOUD_IDENTIFIER || 'gcp-us'` (`:71-76`). `inferIssuer: true` exists because one deployment served many regions; single-project makes it unnecessary and slightly riskier.
- F2. Fail-closed: no `MC_AUDIENCE` -> 401 `Service is not configured for authentication` (`:132-139`); verifier failure -> 401 `Missing or invalid Merchant Center session` (`:141-148`); missing `sub`/project -> 401 `incomplete` (`:150-153`).
- F3. `MC_AUTH_DISABLED === 'true'` takes `projectKey` and `userId` from **query/body** (default `dev-user`), logs a warning on every request, and nothing stops it in production (`:106-130`); `projectKey`/`userId` had to be reserved so they never become feature flags (L: `tests/wire/mc-gateway-auth.spec.ts:287-298`).
- F4. Admin: a hard-coded `ADMIN_EMAILS` list compared by `validateAdmin` with `req.query.userEmail` (client-supplied) (L: `src/middleware/admin.middleware.ts:9-27`) - any caller can claim an admin address. A separate UI-only frontend hook checked a Merchant Center permission group; the legacy code comments that the server cannot verify it. **Both are replaced** (decision D1): admin is membership of the verified gateway user id in the configured `ADMIN_USER_IDS` list; the permission group and every e-mail comparison are removed.
- F5. Ownership: `loadSession` prefers `session.userId === req.user.userId`, but **falls back to `session.userEmail !== req.query.userEmail`** for sessions without a user id (L: `src/middleware/session.middleware.ts:50-77`). The fallback was for legacy sessions and storefront-widget sessions; neither exists in the new project.
- F6. `bootstrapSession` registers the project on first sight, reads identity-binding state and a workspace payload (session, messages, list, digest) and returns `{ projectKey, userId, managedMcpConfigured, identityMcpConfigured, identityUserConnected, toolCallLogs, workspace? }` (L: `src/controllers/mc-auth.controller.ts:122-224`); the response shape is asserted exactly by the legacy test because it is on the first-paint critical path (`tests/wire/mc-gateway-auth.spec.ts:327-342`). Workspace/identity parts belong to G and I.
- F7. Legacy wire test mocks `@commercetools-backend/express` entirely (`tests/wire/mc-gateway-auth.spec.ts:41-68`) so it never exercises the audience/issuer/algorithm logic of the real library. the legacy `AuthenticatedRequest.user` also carried a permissions list (dropped) (L: `src/types/service.types.ts:167-176`).
- F8. Legacy frontends asked the gateway for a permissions claim (`includeUserPermissions: true`, `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/mc-app/src/utils/forward-to.ts:121-137`) and gated admin UI on a custom permission group (`mc-app/src/constants.ts`, `hooks/use-assistant-admin/index.ts`). Not carried over: nothing in the new system needs the claim (see D1), so the frontends omit it and the service never parses it.

**`@commercetools-backend/express@27.9.6` (installed in the legacy service, read in `node_modules/@commercetools-backend/express/dist/commercetools-backend-express.esm.js`)**
- F10. `createSessionAuthVerifier(options)` requires `audience` and `issuer` (cloud identifier or URL); needs headers `x-mc-api-cloud-identifier` and `x-mc-api-forward-to-version` (throws otherwise); with `inferIssuer` it maps the header to an issuer URL, otherwise uses the configured one; builds the expected audience as `origin + pathname` of `audience + request path` for `forward-url-full-path` (query string ignored), or just the origin for `forward-url-origin`; verifies with `jose.jwtVerify(..., { algorithms: ['RS256'], audience, issuer })` against `https://mc-api.<region>.commercetools.com/.well-known/jwks.json`; on success writes `request.session = { userId: sub, projectKey: token[`${iss}/claims/project_key`], plus an optional permissions field that the service ignores }` (`:70-79`, `:143-203`). It reads `request.originalUrl ?? request.url`, so the Express mount path is part of the audience.
- F11. Issuer URLs: `gcp-us -> https://mc-api.us-central1.gcp.commercetools.com`, `gcp-eu -> https://mc-api.europe-west1.gcp.commercetools.com`, `gcp-au -> ...australia-southeast1.gcp...`, `aws-eu -> ...eu-central-1.aws...`, `aws-us -> ...us-east-2.aws...` (same file `:24-33`).

**Platform documentation**
- P1. The MC gateway forwards a JWT in `Authorization: Bearer`; headers `Accept-version`, `X-Forward-To`, `X-Forward-To-Audience-Policy`, `X-Forward-To-Claims`, `X-Project-Key` are set by the client helpers; the gateway checks the user has access to the project before forwarding - https://docs.commercetools.com/merchant-center-customizations/concepts/integrate-with-your-own-api.md . Audience policies: `forward-url-full-path` (default) and `forward-url-origin`; the `audience` option "should only contain the origin URL".
- P2. The gateway JWT carries `sub` (the Merchant Center user id), the project-key claim and optionally permissions (`X-Forward-To-Claims`); it does **not** carry an e-mail address (https://docs.commercetools.com/merchant-center-customizations/concepts/integrate-with-your-own-api.md, section "Configure custom claims"). That is why admin is decided on the user id (which the gateway signs) and never on an e-mail, and why the permissions claim is not requested at all.
- P3. A Connect `service` application's public URL is `{connect-provided-url}/{endpoint}` (https://docs.commercetools.com/connect/development.md); `CONNECT_SERVICE_URL` is injected into **`postDeploy`/`preUndeploy` scripts** (https://docs.commercetools.com/connect/automation-scripts.md); the docs do not say it is present in the running application's environment. Connect injects `CTP_PROJECT_KEY` (and the other `CTP_*`) when `inheritAs.apiClient.scopes` is set (https://docs.commercetools.com/connect/modify-connector.md). Nothing injects the **service's own origin as `MC_AUDIENCE`**: the plan's wording "Connect forwards it to `MC_AUDIENCE`" is not backed by the docs (see plan amendment).

## Glossary

- **forward-to / MC API gateway**: the Merchant Center endpoint `/proxy/forward-to` that relays a browser request to an external API, adding a signed JWT that says "this MC user, in this project, called you".
- **Audience (`aud`)**: who the JWT is for. With `forward-url-full-path` it equals the full URL (origin + path, no query) the browser asked the gateway to call - so the token cannot be replayed against another path or service.
- **Issuer (`iss`)**: the gateway that signed it, `https://mc-api.<region>.commercetools.com`; its public keys are at `/.well-known/jwks.json` (JWKS).
- **`ADMIN_USER_IDS`**: comma-separated allowlist of Merchant Center user ids (the gateway JWT `sub`) that are administrators (connector `standardConfiguration`, optional; empty means nobody is admin).
- **User id (`sub`)**: the Merchant Center / Identity user id in the signed gateway JWT; the only identity the service trusts. The UIs display it as "Your user ID" so an administrator can copy it into `ADMIN_USER_IDS`.
- **Single-project guard**: reject a verified token whose project differs from `CTP_PROJECT_KEY`.
- **Chicken-and-egg (audience)**: the service URL that must become `MC_AUDIENCE` exists only after the first deployment.
- **Fail closed**: when unsure (no audience, bad token), deny.

## Source map

| Legacy file (under `.../service/`) | New file (under `service/`) | Verdict |
|---|---|---|
| `src/middleware/mc-session.middleware.ts` | `src/middleware/mc-session.middleware.ts` | CHANGE: `inferIssuer:false`, project guard, `RequestUser`, header-based bypass, synchronous `isAdmin` from `ADMIN_USER_IDS` |
| `src/controllers/mc-auth.controller.ts` | `src/controllers/mc-auth.controller.ts` | CHANGE: no registration, contributor registry |
| `src/routes/mc-auth.route.ts` | `src/routes/mc-auth.route.ts` | CHANGE: drop `featureFlagsMiddleware` (G re-adds via contributor if needed) |
| `src/middleware/admin.middleware.ts` | `src/middleware/require-admin.middleware.ts` | CHANGE: `req.user.isAdmin` from the `ADMIN_USER_IDS` membership of the verified `sub`, never request input |
| `src/middleware/session.middleware.ts` | `src/auth/ownership.ts` (rule) + G (`loadSession`) | CHANGE: user id only |
| `src/middleware/user-email.middleware.ts` | - | DROP |
| `src/middleware/project.middleware.ts` | - | DROP |
| `src/utils/region.ts` | `src/config/region.ts` (spec C) | CHANGE: only API-region to MC-cloud-identifier mapping used here |
| `src/types/service.types.ts` (`AuthenticatedRequest`) | `src/types/request.types.ts` | CHANGE |
| `tests/wire/mc-gateway-auth.spec.ts` | `tests/wire/mc-session-auth.spec.ts`, `tests/wire/mc-bootstrap.spec.ts` | CHANGE: real verifier + msw JWKS |
| - | `src/config/sections/auth.ts`, `src/auth/admin.ts` (`parseAdminUserIds`, `isAdminUser`), `src/auth/bootstrap-registry.ts` | NEW |

## Decisions

### D1. Admin = membership of the verified gateway user id in `ADMIN_USER_IDS` (owner decision 2026-10-09, replaces the earlier plan decision Q6)
`ADMIN_USER_IDS` (comma-separated Merchant Center user ids, connector `standardConfiguration`, optional, default empty) is the allowlist. `verifyMcSession` verifies the gateway JWT and sets `isAdmin = adminUserIds.has(sub)` synchronously (exact, case-sensitive match after parsing; `isAdminUser(userId, set)` is a pure function). `requireAdmin` only reads `req.user.isAdmin`. The browser learns its own status solely from the bootstrap field `isAdmin` and its own id from the bootstrap field `userId`.
- Parsing (`parseAdminUserIds`, in the `auth` config section): split on `,` (a `;` or whitespace between ids is tolerated), trim, drop empty entries, de-duplicate, at most 50 entries, each entry non-empty and without spaces or control characters (length 1-128); an invalid entry fails startup with a message naming `ADMIN_USER_IDS` and the 1-based position, never the value. The set is never logged; the log states only the count.
- Fail closed: with the variable unset or empty nobody is admin; the service logs one warning at boot (`ADMIN_USER_IDS is empty: no administrator`; once at start, no rate limiting needed) and `/status` reports `adminConfigured: boolean` (never the ids or their count).
- Bootstrap UX: admins do not know their user id up front, so the bootstrap returns `userId` and the frontends show a read-only "Your user ID" line (change O/P/S); the administrator copies it into `ADMIN_USER_IDS` with a configuration redeploy (change U `configure`).
- Why the user id: it is the one identity the gateway signs (P2), it is already verified on every request, and it needs no extra sign-in, storage or network call. Why not trust anything else: `userEmail`, `userLabel`, headers, query and body can all be forged.
- Alternatives: (a) Merchant Center permission group claim - rejected (REMOVED; the claim format was never documented and Team assignment is a second thing to operate); (b) trust a browser e-mail against an e-mail allowlist - rejected (forgeable, the legacy hole); (c) a verified e-mail obtained from a commercetools Identity sign-in - rejected 2026-10-09 (Identity documents no e-mail claim, and the flow needs a popup sign-in, storage and a handshake); (d) Custom Object list of admin ids managed in the UI - rejected (needs a bootstrap admin, circular).
- The permissions claim is not needed for anything else, so the frontends omit `includeUserPermissions` and the service ignores the claim.

### D2. `MC_AUDIENCE` explicit config, optional at boot, fail closed per request
See spec C D2. Value is the **origin** of the deployed service (`https://service-xxxx.<region>.<cloud>.commercetools.app`), validated as origin-only. The first deployment runs with `authConfigured:false`; U's runbook then reads the URL (deployment describe / `CONNECT_SERVICE_URL` in postDeploy) and redeploys with `--configuration MC_AUDIENCE=...`. Alternatives: (a) postDeploy writes the URL into a Custom Object read at startup - rejected: lets anyone with `manage_key_value_documents` change the security audience, and adds a persistence dependency to auth; (b) require it at boot - rejected: deadlocks the first deploy; (c) derive from the `Host` header - rejected: attacker-controlled.

### D3. `inferIssuer:false`, issuer derived from `CTP_REGION`
One project, one region. Pins the accepted issuer to a single JWKS. Alternative (legacy) inference from `x-mc-api-cloud-identifier` - rejected: widens trust for no benefit. The header is still *required* by the library (marker that the request came through the gateway).

### D4. Project guard returns 403, not 401
A valid session for another project is an authorisation problem; frontends treat 401 as "re-authenticate" and would loop. Message is generic and omits both keys.

### D5. Bypass by headers, forced project, production-refusing config
Query-string identity (legacy) leaks into URLs, logs and feature-flag parsing. Headers are not forwarded by browsers by accident. The hard guard lives in `readConfiguration()` (spec C) so a mis-set variable fails the deploy, not just a log line.

### D6. Bootstrap contributor registry instead of importing G/I
The legacy controller imports chat, digest, identity and project code. In the new order D precedes G/I, so D owns an interface and they register: G adds `toolCallLogs`, `workspace`; I adds `identityMcpConfigured`, `identityUserConnected`. Alternative: D returns only the core and the app makes more requests - rejected, the legacy comment documents ~500 ms per extra gateway round trip.

### D7. Test against the real verifier
Tests sign RS256 JWTs with a generated key (`jose`), serve the JWKS via msw at the issuer URL, and drive supertest; they fail if the library, audience construction or claim names change. This is the skill's "parameterised auth rejection matrix" (`references/testing.md`).

### D8. Ownership helper is pure; the middleware that reads the store is G's
D cannot import `SessionStore` (E, parallel). D ships `isOwner` and its tests; G's `loadSession` calls it and returns **404 for a session owned by someone else** (not 403) to avoid revealing existence - recorded for G.

## Risks / Trade-offs

- R1. **Audience mismatch is silent from the user's view** (401 for everything). Mitigation: on verification failure log the expected audience string (not the token) at `warn` once per minute, and expose `authConfigured` on `/status`.
- R2. **Custom View and second Custom Application** call the same service with the same gateway JWT, so admin status is identical in all three apps (it is per user, not per app). Admin-only surfaces still exist only in `mc-app`; the other apps call no admin routes.
- R3. **JWKS fetch on the first request** adds latency and can fail; `jose` caches the key set per issuer in-process. Cold sandbox + JWKS fetch can exceed the gateway's patience once. Acceptable; first-request retry is the frontend's job.
- R4. **Clock skew**: `jwtVerify` default zero tolerance; the 60-second token lifetime makes skew visible. Add `clockTolerance` only via the library option if observed (not supported by `createSessionAuthVerifier` options today - verify; otherwise accept).
- R5. **Dev bypass misuse**: guarded by config; also not declared in `connect.yaml`, so a Connect deployment cannot even receive it (verified by spec B/U checks).

## Migration Plan

No data migration. Frontends (O) stop sending `userEmail`; until then the service ignores it. Sessions created by the legacy system are not carried over.

## Open questions

- Q-D1. (closed 2026-10-09) Admin is the `ADMIN_USER_IDS` allowlist; nothing else is needed from the owner.
- Q-D2. Which exact entry-point path will the deployed `mc-app` use (default `ai-assistant`)? Owned by B/O; D still reads `MC_APP_ENTRY_POINT_URI_PATH` (kept for logging and the app URL checks) but no longer derives any permission key from it. Mirrored in amendments for B.
- Q-D3. (closed 2026-10-09) The bootstrap exposes `isAdmin` and `userId` only; no permission list.

## Changelog

- 2026-10-09: admin model decided (owner). Admin = membership of the verified gateway JWT `sub` in `ADMIN_USER_IDS`, computed synchronously by `verifyMcSession`; no e-mail allowlist, no verified-e-mail record, no resolver or reader port, no Merchant Center permission group, `ADMIN_PERMISSION_KEY`, permissions-claim parsing or `includeUserPermissions`. Dev bypass uses `x-dev-admin`; bootstrap returns `{projectKey, userId, isAdmin}` (the id feeds the frontends' "Your user ID" line) and no `permissions`/`adminSignIn`; empty `ADMIN_USER_IDS` fails closed with a boot warning and `/status.adminConfigured`; scenarios for forged e-mail/label/header/query/body and for list parsing added; tasks 2.2/3.1/3.3/5.3/7.x rewritten and renumbered; Explore findings F4/F8/P2 rewritten, Q-D1/Q-D3 closed.
