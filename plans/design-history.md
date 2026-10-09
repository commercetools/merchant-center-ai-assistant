# Design history

Corrections and amendments made to the first plan while the specifications were written. Each row states the corrected fact. Authoritative detail is in the `design.md` of the change named in the last column.

## Corrections to the first plan

| # | First plan | Corrected | Changes |
|---|---|---|---|
| 1 | `CTP_REGION` is inherited from Connect. | Connect injects only `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY`, `CTP_SCOPE`; `CTP_REGION` is a normal configuration key and the SDK client is built from the injected URLs. | B, C |
| 2 | Connect gives the service its own URL, which becomes `MC_AUDIENCE`. | `CONNECT_SERVICE_URL` exists only in `postDeploy` and `preUndeploy`; the service fails closed until a configuration redeploy sets `MC_AUDIENCE` and `CHAT_SERVICE_ENDPOINT_URL`. | B, D, U |
| 3 | Custom Object chunk limit 800 KB. | The platform limit is a 16 MB JSON document (guidance up to 2 MB, request up to 14 MB); chunks are sized 192 to 512 KiB. | E, N |
| 4 | Two full persistence implementations. | Stores are built once over an object gateway with a Custom Object backend and an in-memory backend. | E |
| 5 | A staged connector can be deployed to the sandbox. | The sandbox needs a published connector; rehearsals use a private staging repository (M15); `connect validate` needs Docker (M14). | U |
| 6 | Administrators are decided by a Merchant Center permission group. | Replaced by `ADMIN_USER_IDS` (row 17); the permission group, claim parsing and capture task are removed; the MCP scopes moved into the applications' normal `oAuthScopes`. | D, O |
| 7 | `composed-apps` talks to the service. | Not needed (Q40): bootstrap, `forward-to.ts` and `CHAT_SERVICE_ENDPOINT_URL` are removed. | R |
| 8 | Browser login is step M7. | Browser login is M8; the DevTools tooling needs a debugging URL and a workspace argument and a session restart. | V |
| 9 | `getModel('main' / 'lite' / 'image')`. | Four tiers including `agent`; `GOOGLE_VERTEX_API_KEY` must be refused because it silently switches Vertex to key mode. | F |
| 10 | The original feature list is accurate. | It was stale: only one custom permission group existed, and several UIs were already gone. | O |
| 11 | Publication removes `plans/` and `openspec/`. | Superseded by row 19: both are published, scrubbed. | A, X |
| 12 | Third-party credentials are entered in a Merchant Center UI and stored encrypted in Custom Objects. | Decision Q4: Connect deployment configuration; a read-only `GET /service/mcp/providers` reports `{provider, configured, enabled, missingKeys[]}`. | B, C, E, J, Q, U, V, W |

## Hardening beyond a straight port

Time budget for chat (270 s plus 30 s reserve); feedback body parser registered after authentication (10 MiB); administrator-only writes for system prompt, tool-call logs and identity binding; provider credentials only in Connect configuration; BigQuery SELECT-only guard, `maximumBytesBilled` and session-scoped tables; CSV formula neutralisation; Algolia SSRF guard; identity-token sweep on unbind; composed-page server transpile accepted by the client; UTF-8-safe base64 for the custom-view flag; system prompt injected once.

## Contract changes between changes

`ToolSource` also has `displayName`, `order`, `kind`, `getPrompt`; `ToolMenuProvider`, `ConnectedSourcesProvider` and `registerSessionCleanupHook` (G, wired by H and L); `ImageUploader` (H, provided by L); `RequestUser {userId, projectKey, isAdmin}` and `registerBootstrapContributor` (D); `/auth/session` returns `{projectKey, userId, isAdmin, ...}`; frontends send no `userEmail` and filter by `userId`; the `data-ct-annotations` message part is persisted by G and H; session routes return 404 for foreign sessions; `GET /session/:id/tools` exists next to `POST`.

## Amendments of 2026-10-09

| # | Earlier plan | Now | Changes |
|---|---|---|---|
| 13 | Administrators by permission group. | Superseded by row 17 the same day (an e-mail based model was tried and dropped). | D, E, I, O, Q, V |
| 14 | A browser-supplied e-mail is shown in the backoffice and feedback. | A display-only, sanitised `userLabel`, never trusted. | G, N, Q |
| 15 | Test environment of two teams with permission groups. | Scratch project with administrator A and non-administrator B (M10). | V, all |
| 16 | Several questions open. | Decided: GECX dropped, only Vertex Gemini, no retention job, 270 s plus 30 s, identity MCP kept, backoffice kept with audit lines, administrator-only means `ADMIN_USER_IDS`. | see `plans/decisions.md` |
| 17 | E-mail based administrator model. | `ADMIN_USER_IDS` only (Q6): comma-separated user ids in `standardConfiguration`, checked by change D against the signed JWT user id; an empty list means nobody is an administrator (`/status.adminConfigured`). Removed: the e-mail setting, the admin sign-in flow and its handshake, the related UI and error code, the probe script. Display-only `userLabel` and 403 `ADMIN_REQUIRED` stay. | C, D, E, G, I, N, O, P, Q, S, U, V, W, Z |
| 18 | No way for an administrator to learn their user id. | A read-only "Your user ID" line (mc-app Settings > About, view-app footer) fed by the bootstrap `userId`; README instruction; an end-to-end scenario; rehearsal check of the comma-separated configuration value. | O, P, S, U, V, W |
| 19 | `plans/` and `openspec/` removed from the public commit. | Kept and published as scrubbed design documentation (Q16); internal tooling and agent configuration are still removed. | A, W, X, Z |
| 20 | Naming and release questions open. | Decided (Q10, Q14, Q50). | A, B, U, X, Z |
