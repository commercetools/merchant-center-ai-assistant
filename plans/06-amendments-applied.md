# 06 — Amendments from spec authoring (what changed vs. the first plan)

The six authoring agents verified facts and found corrections. Applied inline to 00–05 where a statement was **wrong**; everything else is recorded here. Authoritative detail lives in each change's `design.md`.

## Corrections to the first plan

| # | Was | Now | Source |
|---|---|---|---|
| 1 | `CTP_REGION` inherited from Connect | Connect injects only `CTP_API_URL, CTP_AUTH_URL, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_PROJECT_KEY, CTP_SCOPE`; `CTP_REGION` is a normal config key; SDK client is built from the injected URLs | B, C |
| 2 | Connect gives the service its own URL → `MC_AUDIENCE` | `CONNECT_SERVICE_URL` exists only in `postDeploy/preUndeploy`; service fails closed until a **configuration redeploy** sets `MC_AUDIENCE` (and `CHAT_SERVICE_ENDPOINT_URL`) | B, D, U |
| 3 | Custom Object chunk limit 800 KB (Firestore habit) | Platform limit is a 16 MB JSON document (guidance ≤ 2 MB, request ≤ 14 MB); chunks re-sized (192–512 KiB) | E, N |
| 4 | Two full persistence implementations | Stores built **once** over an `ObjectGateway` with a Custom Object backend and an in-memory backend | E |
| 5 | Sandbox deploy of a staged connector | Sandbox needs a **published** connector; rehearsals need a private staging repo (M15); `connect validate` needs Docker (M14) | U |
| 6 | Admin gating by a Merchant Center permission group (earlier plan) | Replaced 2026-10-09 (final: row 17) by `ADMIN_USER_IDS`; the permission group, its key override, claim parsing and the capture task are removed; scopes `view_mcp_servers`/`manage_mcp_servers` moved to the apps' normal `oAuthScopes` | D, O |
| 7 | `composed-apps` talks to the service | Not needed: bootstrap, `forward-to.ts`, `CHAT_SERVICE_ENDPOINT_URL` removed (Q40) → two `forward-to` copies | R |
| 8 | Chrome login is M7 | Chrome login is **M8**; DevTools MCP needs `--browserUrl` + `--workspace` args and a session restart (RM1/RM2) | V |
| 9 | `getModel('main'|'lite'|'image')` | Four tiers incl. `agent`; `GOOGLE_VERTEX_API_KEY` must be refused (silently switches Vertex to key mode) | F |
| 10 | Legacy FEATURES.md accurate | Stale: only one custom permission group existed (now removed); `.env`, Data-Warehouse UI and team UI already gone upstream; `use-create-api-client` gone | O |
| 11 | Publication removes plans/openspec | Superseded by row 19 (plans/ and openspec/ are published, scrubbed); still removes `.claude/`, `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/`, `scripts/internal-paths.json` | A, X |
| 12 | Third-party credentials (Contentstack/Algolia/Stripe) entered by admins in an MC UI, stored AES-GCM-encrypted in Custom Objects (`McpConfigStore`, container `ai-assistant-mcp-configs`, `/mcp/configs` CRUD) | Owner decision Q4 (2026-10-09): Connect deployment configuration - secrets `CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` in `securedConfiguration`; `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION` (default `na`), `STRIPE_CONNECTED_ACCOUNT_ID` in `standardConfiguration`; read once by `readConfiguration()`; provider enabled iff required keys set and valid; read-only `GET /service/mcp/providers` (`{provider, configured, enabled, missingKeys[]}`); Settings shows read-only status cards; U adds `configure` and a postDeploy provider report. Also decided: Q2 keep Contentstack, Q3 embed Nimbus | B, C, E, J, Q, U, V, W |

## New behaviour decisions (hardening that goes beyond a straight port — all listed in the change specs)

Time budget for chat (270 s + 30 s reserve) · feedback body parser registered **after** auth, 10 MiB · admin-only writes for system prompt / tool-call-logs / identity binding · provider credentials only in Connect configuration (never returned or stored) · BigQuery SELECT-only guard + `maximumBytesBilled` + session-scoped tables · signed image URLs · CSV formula neutralisation · Algolia SSRF guard · identity-token sweep on unbind · composed-page server transpile accepted by client (`isUsableTranspiledCode`) · UTF-8-safe base64 for the custom-view flag · system prompt injected once.

## Changes to contracts between specs (added to 03)

`ToolSource` also has `displayName, order, kind, getPrompt` · `ToolMenuProvider`, `ConnectedSourcesProvider`, `registerSessionCleanupHook` (G; wired by H, L) · `ImageUploader` (H; provided by L) · `RequestUser {userId, projectKey, isAdmin}`, `registerBootstrapContributor` (D) · `/auth/session` returns `{projectKey, userId, isAdmin, ...}` (+ contributor fields `identityMcpConfigured`, `identityUserConnected`; no permissions) · frontends send **no** `userEmail`; filters use `userId` · `data-ct-annotations` message part persisted by G/H · session routes 404 for foreign sessions · `GET /session/:id/tools` added next to `POST`.

## Ownership moves

Nimbus prompt files → M · Stripe schema test + developer-tips text → J · `file.utils` split → L · `export.tool.ts` owned by H, hardened by L · U also needs E and F.

## Amendments of 2026-10-09 (owner decisions)

| # | Earlier plan | Now | Specs |
|---|---|---|---|
| 13 | Admin by MC permission group (row 6) | (SUPERSEDED by row 17 the same day) `ADMIN_EMAILS` + verified e-mail from Identity admin sign-in (scope `openid`), `isAdmin` decided by the service, 7-day verification, completion handshake against login-CSRF; bootstrap problem solved by the sign-in needing no MCP server; blocking question BQ-ID1 (e-mail claim undocumented) | D, E, I, O, Q, V |
| 14 | Browser e-mail shown in backoffice/feedback | display-only sanitised `userLabel`, never trusted | G, N, Q |
| 15 | Test environment: two Teams with permission groups | scratch project + admin user A (user id in `ADMIN_USER_IDS`) and non-admin user B; manual step M10 | V, all |
| 16 | Q7, Q11, Q13/Q25, Q21, Q5, Q8/Q26, Q17 open | DECIDED (GECX dropped, only Vertex Gemini, no retention job, 270 s + 30 s, identity MCP kept, backoffice kept with audit lines, admin-only = `ADMIN_USER_IDS`) | per `owner-questions.md` |
| 17 | Row 13: `ADMIN_EMAILS` + verified e-mail (Identity admin sign-in, scope `openid`, `verified-email.<userId>` record, 7-day verification, completion handshake, blocking question BQ-ID1) | **`ADMIN_USER_IDS` only** (comma-separated Merchant Center user ids, `standardConfiguration`), checked against the signed forward-to JWT user id by change D; empty list = nobody admin (fail closed, startup warning, `/status.adminConfigured`). Removed: `ADMIN_EMAILS`, the `admin-email-verification` capability, `/admin-signin/*`, popup + handshake, `useAdminSignIn`, 'Verify administrator access', `IDENTITY_EMAIL_UNAVAILABLE`, `scripts/probe-identity-email.ts`, M25, BQ-ID1, OQ-ID2..7, bootstrap field `adminSignIn`, `AdminResolver`/`VerifiedEmailReader`. Change I is back to identity MCP only with admin-only binding endpoints. Kept: no permission group, scopes in normal app scopes, `isAdmin` from the service only, 403 `ADMIN_REQUIRED`, display-only `userLabel` | C, D, E, G, I, N, O, P, Q, S, U, V, W, Z |
| 18 | No way for an admin to learn their user id | Read-only 'Your user ID' line (mc-app Settings > About, view-app footer) fed by the bootstrap `userId`; README bootstrap instruction; E2E scenario (shows own id, copy into `ADMIN_USER_IDS` via `configure` redeploy, admin surfaces appear after refresh); rehearsal check that Connect `--configuration` carries a comma-separated value as one key | O, P, S, U, V, W |
| 19 | Q16 default: `plans/` and `openspec/` removed from the public commit | DECIDED: kept and published as scrubbed design documentation; `.claude/`, `CLAUDE.md`, `scripts/labs-gate.sh`, `scripts/internal/`, `scripts/internal-paths.json` still removed; change X specifies the SCRUB step and leak scan; A's internal-path list and checkers updated; archived changes published after the scrub | A, W, X, Z |
| 20 | Q10/AQ1, Q14/Q50 open | DECIDED as proposed: naming (repo, packages, app names, entry paths, npm for service / yarn for frontends); sandbox + private connector, release `0.1.0` | A, B, U, X, Z |
