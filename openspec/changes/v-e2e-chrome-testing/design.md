## Context

Change V (`v-e2e-chrome-testing`), wave 8. R9: the agent tests, the owner does not. Read `plans/04-workflow.md` sections 4-5, `plans/manual-steps.md` (M3-M11), and every feature change's "Chrome scenario ids" bullet. Other authors are working concurrently, so **ids defined inside another change's `tasks.md` win**; V's catalogue below supplies defaults for changes that have not yet fixed ids and V's own cross-cutting ids (`E2E-V-nn`).

## Explore findings

1. **Tool inventory** (schemas read 2026-10-08 from the connected Chrome DevTools MCP). Every page-scoped tool requires `pageId` (server default `--pageIdRouting` true): `list_pages` (no args), `new_page{url, isolatedContext?, background?, timeout?}`, `select_page{pageId, bringToFront?}`, `close_page{pageId}`, `navigate_page{pageId, type: url|back|forward|reload, url?, ignoreCache?, timeout?, initScript?, handleBeforeUnload?}`, `take_snapshot{pageId, filePath?, verbose?}` (a11y tree with `uid`s; uids are valid only for the latest snapshot), `take_screenshot{pageId, filePath?, format?, fullPage?, uid?}`, `click{pageId, uid, dblClick?, includeSnapshot?}`, `fill{pageId, uid, value}`, `fill_form{pageId, elements[{uid,value}]}`, `type_text{pageId, text, submitKey?}`, `press_key{pageId, key}` (e.g. `Enter`, `Control+A`, `Meta+Enter`), `hover`, `upload_file{pageId, uid, filePaths[]}`, `handle_dialog{pageId, action}`, `wait_for{pageId, text[], timeout?}` (resolves when ANY text appears), `evaluate_script{pageId, function, args[uid], filePath?, waitForStableDom?}` (returns JSON), `list_network_requests{pageId, resourceTypes[], pageSize?, pageIdx?, includePreservedRequests?}`, `get_network_request{pageId, reqid, requestFilePath?, responseFilePath?}`, `list_console_messages{pageId, types[], includePreservedMessages?, pageSize?}`, `get_console_message{pageId, msgid}`, `emulate{pageId, networkConditions: Offline|Slow 3G|Fast 3G|Slow 4G|Fast 4G, extraHttpHeaders (JSON string, '' clears), viewport, userAgent, colorScheme, cpuThrottlingRate}`, `resize_page{pageId,width,height}`, plus performance/lighthouse/heap tools (not used).
2. **Server options that matter** (`npx chrome-devtools-mcp@latest --help`): `--browserUrl http://127.0.0.1:9222` or `--wsEndpoint` attach to a running Chrome; `--autoConnect` (Chrome 144+, enable remote debugging at `chrome://inspect/#remote-debugging`); `--userDataDir`, `--isolated`, `--channel`; `--redactNetworkHeaders` (redacts sensitive headers in tool output - enable); `--workspace <dir>` / default: **file-writing tools (screenshot/snapshot/script/network `filePath`) are restricted to the OS temp directory unless a workspace root is allowed**; `--blockedUrlPattern`/`--allowedUrlPattern` (start-time only); `--viewport`; `--acceptInsecureCerts`. `new_page.isolatedContext` creates cookie-free contexts (used for auth-failure tests). `navigate_page.initScript` runs before page scripts on the next navigation (used to simulate gateway 401 / offline service by wrapping `fetch`).
3. **Flow constraints from the apps** (legacy `FEATURES.md`): all browser-to-service traffic is one URL, `${mcApiUrl}/proxy/forward-to`, with the real target in header `x-forward-to` (and `x-forward-header-*` relays); therefore `list_network_requests` shows only that URL - assertions on the service path must read the request header via `get_network_request`. The gateway URL must never get a query string (CORS preflight, `forward-to.ts` comment). Change O task 11.2 asserts these headers.
4. **Existing scenario ids** (read from other changes 2026-10-08): G-01..G-08 (new chat, list/delete, digest, suggestions, tools menu persistence, system prompt admin/non-admin 403, customView isolation, tool-call-log mode), I-01..I-07 (+I-05b), O-01..O-05 (bootstrap, request shape, `isAdmin` gating, CSP, reauth gate), P-01..P-15, R-01..R-09, S-01..S-10, T-01..T-08 (conditional). H design reserves **E2E-H-04** = a ~4 minute turn on a sandbox deployment to measure proxy/gateway timeouts (OQ-H2). Ids for C, D, E, F, J, K, L, M, N, Q, U are not yet authored: V reserves defaults (catalogue below) and the lint reconciles.
5. **Platform facts** (Connect docs `deployment-behavior-and-environments`): sandbox scales to zero (about 15 s boot), a service request times out after 5 minutes, instances are horizontally scaled (so PKCE state cannot live in memory) - cited in change H design item 17. Test-only knobs requested from other changes: configurable stream budget (H), instance id exposed by `GET /service/status` (C), `data-testid` hooks (P, Q, S).
6. **Merchant Center host**: `ct-region-gotchas` says the Merchant Center for GCP US central is `https://mc.us-central1.gcp.commercetools.com`; logs may wrongly print `europe-west1` - do not assert on that string.
7. **Chrome limitation to verify in task 1.2**: recent Chrome versions refuse `--remote-debugging-port` when the default user-data directory is used; the framework therefore uses a dedicated profile directory, in which the tester logs in once (M8). Verify with the installed Chrome version before documenting.
8. **No legacy tests**: `FEATURES.md` "There are no frontend tests in any package"; jest wire tests exist only in the service (`service/tests/wire/*`) and are ported by the spec owners.

## Glossary

- **Scenario card**: one E2E test case in a playbook, with steps, assertions, cleanup.
- **Playbook**: a markdown file under `e2e/` holding the cards of one feature spec.
- **Oracle**: how an assertion is checked: `DOM` (snapshot/evaluate_script), `NET` (network list/detail), `CONSOLE`, `SHELL` (command output), `CO` (Custom Object read via API).
- **Macro**: reusable sequence of tool calls defined in `e2e/01-macros.md` (open app, send message, wait for stream, assert clean).
- **Ledger**: `plans/evidence/<run-id>/ledger.jsonl` listing created sessions/objects for cleanup.
- **Run id**: `YYYYMMDD-HHMM-<env>`.
- **Gateway replay**: copying the headers of a legitimate `/proxy/forward-to` request and re-sending it from the page with another method/path to test authorization.
- **Preflight**: tier-0 scenarios that prove the environment before features are tested.
- **ADMIN_USER_IDS**: Connect configuration allowlist (comma-separated Merchant Center user ids) of administrators; user A's id is in it, user B's is not; empty means nobody is an administrator.
- **Your user ID**: the read-only line (Settings > About in `mc-app`, panel footer in `mc-view-app`) that shows the signed-in user's own `userId` from the bootstrap.
- **Admin user / non-admin user**: Merchant Center users A and B of the scratch project.

## Source map

| Legacy / source | New file | Verdict |
|---|---|---|
| `FEATURES.md` (chat app) feature sections | `e2e/P-mc-app-chat.md`, `Q-mc-app-admin.md`, `R-composed-apps.md`, `S-mc-view-app.md` | NEW (derived) |
| `FEATURES.md` (router) feature sections | `e2e/G-sessions.md`, `H-chat-stream.md`, `I-identity-mcp.md`, `J-tool-sources.md`, `K-nimbus.md`, `L-bigquery-gcs.md`, `M-composed-pages.md`, `N-feedback-backoffice.md` | NEW (derived) |
| `plans/01-source-inventory.md` | `e2e/03-traceability.md` | NEW |
| `plans/04-workflow.md` section 5 | `e2e/00-conventions.md` | CHANGE (formalised) |
| `service/tests/wire/*` | not duplicated; run as gate `E2E-V-08` | KEEP |
| none | `scripts/e2e/*.mjs`, `*.sh` | NEW |

## Decisions

**D1. Markdown playbooks executed by an agent, not a scripted runner.** Alternatives: (a) Playwright/Puppeteer scripts - rejected: R9 and the plan mandate the Chrome DevTools MCP, SSO/2FA live in the logged-in profile, and the same agent that implements can read cards; (b) YAML DSL with a custom runner - rejected: cost with no consumer. Cards are strict enough to lint (D2) and exact enough that a different agent run is reproducible.

**D2. Card format and lint.** Template in `e2e/00-conventions.md`:

```
### E2E-<S>-<nn> - <title>
- Spec: <change-id> / <requirement>
- Tags: smoke | regression | destructive | slow | negative | needs:M8 | needs:second-user | needs:secrets
- Env: local | sandbox | both
- Budget: <seconds>
- Pre: <state, fixtures, manual steps>
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL"}
  2. SHELL: curl -si "$SERVICE_URL/service/status"
- Assert:
  A1 [NET] ... A2 [DOM] ... A3 [CONSOLE] no error-level message from app code
- Cleanup: ...
- Evidence: snapshot-final.txt, screenshot-final.png, network.json, console.txt
```
`extract-scenario-ids.mjs --lint` parses `### E2E-` headings and required bullet keys.

**D3. Id ownership and reconciliation.** Existing ids stay (G, I, O, P, R, S, T). Reserved defaults:
C-01 status + error shape, C-02 fail-fast config (shell); D-01 bootstrap payload, D-02 verifier negatives, D-03 project mismatch (needs 2nd project), D-04 admin matrix API (admin user 200, non-admin user 403 `ADMIN_REQUIRED`), D-05 auth-disabled refused in production (shell); E-01 containers + encryption inspection, E-02 settings persistence + 409 retry, E-03 delete cascade; F-01 Vertex main model live smoke, F-02 bad SA key fails fast (shell), F-03 usage metadata; H-01 stream structure, H-02 tool/subagent part + schema normalisation, H-03 chart/export/entity link, **H-04 long turn (about 4 min) on sandbox**, H-05 stop/abort, H-06 error-frame retry; J-01 Knowledge MCP, J-02 Contentstack, J-03 Algolia, J-04 Stripe, J-05 provider status cards configured/not configured (names only, no values), J-06 unconfigured or partially configured provider hides its tools; K-01 Nimbus question, K-02 child respawn, K-03 readiness; L-01 offload + aggregated query, L-02 SQL guard, L-03 image generation displays through the backend (private mode, blob URL), L-04 export file, L-05 image privacy (direct bucket URL 403, other user 404); M-01 create composed page via chat -> listed, M-02 invalid page rejected, M-03 stored schema 5.0; N-01 feedback submit/fetch API, N-02 backoffice list/detail, N-03 non-admin 403, N-04 large snapshot chunks; Q-01 identity connect page, Q-02 configuration panel (read-only provider status cards), Q-03 system prompt edit/reset, Q-04 MCP providers forms, Q-05 non-admin user sees no admin surfaces and direct navigation shows the "Administrator access required" notice, Q-06 backoffice UI + alaSQL; U-01 deployed apps load, U-02 two-phase deploy, U-03 postDeploy idempotent redeploy, U-04 undeploy cleanup. When the owning change later defines different ids, the traceability table is updated (task 9.2); `extract-scenario-ids.mjs --trace` is the safety net.

**D4. Cross-cutting scenarios are V's (`E2E-V-nn`)** so they do not collide with feature ids: V-01 preflight/attach; V-02 auth failure; V-03 non-admin user (id not in `ADMIN_USER_IDS`); V-04 restart persistence; V-05 multi-instance PKCE; V-06 five-minute budget; V-07 cleanup/orphans; V-08 service gates (`npm test`, `commercetools connect validate`, drift and SPDX checks); V-09 cold start after scale-to-zero; V-10 secrets never reach the browser; V-11 dropped features absent; V-12 forged e-mail, label or header never grants admin; V-13 own user ID and administrator bootstrap (`ADMIN_USER_IDS`).

**D5. Attaching to Chrome (manual step M8 refined).** Preferred: dedicated profile.
1. Quit nothing; start a second Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/ai-assistant-e2e-chrome"` (macOS).
2. In that window sign in to Merchant Center once as the admin user and open the scratch project (SSO/2FA stays manual). The non-admin user needs a second dedicated profile directory (`$HOME/.cache/ai-assistant-e2e-chrome-b`, port 9223) or a separate isolated browser context logged in once; the agent switches users by attaching to the other port (a second MCP server entry `chrome-devtools-b`) instead of logging in and out. Each user is logged in once per profile (manual step M10).
3. Configure the MCP server arguments (`~/.claude.json` or project `.mcp.json`): `chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222 --redactNetworkHeaders --workspace=<repo>/plans/evidence` and restart the Claude Code session (MCP config is read at start).
Alternative: `--autoConnect` (Chrome 144+, remote debugging enabled at `chrome://inspect/#remote-debugging`) to reuse the everyday profile - rejected as default because it exposes the owner's other sessions to the agent.
`E2E-V-01` verifies the attachment.

**D6. Environments.**
- *Local*: `scripts/e2e/dev-up.sh` (1) starts a tunnel (`cloudflared tunnel --url` or `ngrok http`, whichever is installed; the gateway is cloud-side so `localhost` is unreachable), (2) writes the tunnel URL into `service/.env.local` as `MC_AUDIENCE` base, (3) starts the service, (4) starts each app with `mc-scripts start` on distinct ports (port flag/env verified in task 2.1), (5) exports `SERVICE_URL`, `APP_URL`, `PAGES_URL`, `VIEW_URL` to `e2e/.env.e2e`. Dev-mode apps run inside MC at `http://localhost:3001` as the Custom Application development host (the logged-in MC loads it via the application's dev URL).
- *Sandbox*: URLs from `commercetools connect deployment get`; apps registered in MC with those URLs (M9). Cold start 15 s is absorbed by the first `wait_for` (timeout 60 s).
Cards tagged `local` only: restart by `kill`, two-instance proxy, reduced budget. Cards tagged `sandbox` only: H-04 long turn, V-09 cold start, U-*.

**D7. Evidence.** `plans/evidence/<run-id>/<scenario-id>/`: `snapshot-<n>.txt` (take_snapshot filePath), `screenshot-<n>.png`, `network.json` (written by `evaluate_script`? no - by agent from `list_network_requests`; store `reqid,method,url,status,x-forward-to`), `console.txt`, `result.json` `{id,status,startedAt,durationMs,notes,retries}`. Because the MCP restricts file writes to the OS temp directory unless a workspace is allowed (finding 2), cards write to `$TMPDIR/e2e/<run-id>/...` and `scripts/e2e/collect-evidence.sh <run-id>` moves them; with `--workspace` configured they are written directly. `report.md` columns: id, title, env, status, duration, evidence link, notes.

**D8. Fixtures and cleanup.** Everything created by tests is named with the `e2e-` prefix (chat text `e2e-...`, composed page keys `e2e-*`, feedback comments `e2e-*`, provider keys are dummy deployment configuration values `e2e-dummy-key` / `sk_test_e2edummykey`, set with the U `configure` command). `ledger.mjs add <kind> <id>` is called after each creation (session ids are read from `POST session` responses via `get_network_request`). `cleanup.mjs`: (1) deletes ledger entries through the **service API** where one exists (exercises delete paths), (2) falls back to Custom Object deletion with the dev API client (M3) only for keys starting `e2e-`, (3) `--sweep` removes objects older than 24 h with `e2e-` markers across `ai-assistant-*` and the composed-pages container, (4) never deletes settings, tokens of other users, or any object lacking the marker. Seeding `seed.mjs <fixture>`: `composed-pages` (5 pages for R), `large-snapshot` (feedback test), `sessions-many` (pagination).

**D9. LLM rules** (in `e2e/00-conventions.md`): prompts start with `e2e-`; protocol/structure only; nonce echo for soft content checks (`Reply with the single word E2E-OK-<nonce>`), at most one retry in a fresh session; timeouts: first token 30 s (cold 60 s), complete 120 s, tool turn 180 s, budget scenarios as declared; classify failures: INFRA (gateway 5xx, tunnel down - retry whole tier once after preflight), LLM (soft assertion), BUG (everything else). Never retry authorization, console-error or status-code assertions. Two consecutive FAILs of the same card stop the tier.

**D10. Stable selectors.** Prefer accessible names from `take_snapshot`; request `data-testid` hooks (amendment): `chat-status` (`data-status=ready|submitted|streaming|error`), `chat-composer`, `chat-send`, `chat-stop`, `session-list-item`, `admin-config-save`. `evaluate_script` reads them without parsing the a11y tree. If hooks are missing the macro falls back to snapshot text.

**D11. Gateway replay macro** (for authorization tests): `get_network_request` on a legitimate call (e.g. `POST .../auth/session`) -> copy request headers (keeping the `x-forward-*` family, dropping `content-length`) into a JS literal -> `evaluate_script`: `async () => { const r = await fetch(url, {method:'PUT', credentials:'include', headers:{...captured, 'x-forward-to': SERVICE+'/system-prompt'}, body: JSON.stringify({systemPrompt:'e2e'})}); return {status:r.status, body:(await r.text()).slice(0,200)} }`. Works because the gateway re-signs the JWT per request with the signed-in user's id and project key; whether that user is an administrator is decided by the service from the verified e-mail, so the replay is a faithful test of the authorization.

**D12. V-02 (auth failure) design.** Part A SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session"` -> 401; same with `-H 'Authorization: Bearer abc.def.ghi'` -> 401; same with a token whose audience differs (`scripts/e2e/make-bad-jwt.mjs` signs with a throwaway key; the verifier must still reject for unknown `kid`/signature) -> 401; `curl -si $SERVICE_URL/service/status` -> 200; body must not contain `at ` stack lines or `Error:`. Part B: `new_page{url: APP_URL, isolatedContext: "e2e-anon"}` -> `wait_for` text from the MC login page (`Log in`/`Sign in`; assert URL host contains `/login`); `list_network_requests` has no 2xx to `forward-to`. Part C: `navigate_page{type:"url", url: APP_URL, initScript: "const f=window.fetch;window.fetch=(i,o)=>String(i&&i.url||i).includes('/proxy/forward-to')?Promise.resolve(new Response('{}',{status:401})):f(i,o)"}` -> `wait_for ["session has expired","Sign in again"]` (text per O/P) and `take_snapshot` shows Retry; repeat for `VIEW_URL` (error + Retry). Cleanup: reload without initScript.

**D13. V-03 (non-allowlisted user).** Needs the non-admin user B (an MC user on the scratch project with the app's ordinary View/Manage permission through a Team, whose user id is NOT in `ADMIN_USER_IDS`; manual step M10) in the second Chrome profile. If user B is not available the card is SKIPPED(M10). No permission or Team of any user is edited during a run. Steps: open the app as user B; `GET /auth/session` replay shows `isAdmin:false`; snapshot: no admin nav items (settings write, system prompt, tool-call-log mode, backoffice, feedback review, Managed MCP setup), the config panel shows read-only status cards without Save; the "Your user ID" line shows B's own id; direct navigation to an admin route shows the "Administrator access required" notice; `evaluate_script` DOM scan for the dummy secret value `e2e-dummy-key` -> absent; gateway replay `PUT /system-prompt` -> 403 `{code:'ADMIN_REQUIRED'}`; `GET /backoffice/threads` -> 403; `PUT /managed-mcp-identity` -> 403; read endpoints that are allowed (sessions, digest) -> 200; `GET /system-prompt` value unchanged.

**D13a. V-12 (forged e-mail, label or header never grants admin).** As the non-admin user B, gateway replay (D11) of an admin route (`PUT /system-prompt`, `GET /backoffice/threads`) with (a) request header `x-admin-email: <any address>`, `x-user-email`, `x-user-id: <user A's id>`, (b) JSON body fields `userEmail`, `email`, `userLabel`, `userId` and `isAdmin:true`, (c) query string `?userEmail=<any address>` appended to the service path (the gateway URL itself never gets a query string): all answer 403 `ADMIN_REQUIRED`; then user B creates a session and sends feedback with `userLabel` = user A's label: the stored session owner is still B's `userId` (`CO` read), user A's session list does not contain it, and the backoffice (as user A) shows the label marked "(unverified)" rendered as text without a link. The user ids are read at run time and replaced by `<user-id-a>`/`<user-id-b>` in evidence.

**D13b. V-13 (own user ID and administrator bootstrap).** Pre: M10 done, users A and B logged in, `ADMIN_USER_IDS` empty (a fresh deployment or the local `.env.local` without the key). Steps: (1) both users open `mc-app` Settings > About: `evaluate_script`/snapshot reads the "Your user ID" line; it equals `userId` of the `POST /auth/session` replay response and A's differs from B's; the same line is present in the `mc-view-app` panel footer when that surface shows it (otherwise SKIPPED(note)); (2) `GET /service/status` replay shows `adminConfigured:false`, start log (`logs --application service` or local console) contains `ADMIN_USER_IDS is empty: no administrator`, `isAdmin:false` for both, `PUT /system-prompt` -> 403; (3) copy A's id from the line (the agent reads it, never types a guess) and run `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<A's id>` (sandbox) or restart the local service with the value; wait for `Deployed`; (4) both users reload: A has `isAdmin:true`, admin nav visible, `PUT /system-prompt` replay -> 200; B `isAdmin:false`, 403; (5) optional rehearsal of U10: set `ADMIN_USER_IDS=<A's id>,<B's id>` and assert both users become administrators (comma list arrives as one value); then restore to A only. Cleanup: restore `ADMIN_USER_IDS` to A only (or empty for the next fresh run) and the system prompt.

**D14. V-04 (restart persistence).** Local: 1) create session with message `e2e-restart-<nonce>`; set system prompt `e2e-sp-<nonce>` as admin; 2) `SHELL: lsof -ti tcp:$SERVICE_PORT | xargs kill` (also kill embedded Nimbus child if orphaned); wait until `curl /service/status` fails; 3) `scripts/e2e/dev-up.sh --service-only`; wait for 200; 4) reload page; assert transcript contains the nonce, session in drawer, `GET system-prompt` returns the value, identity status connected, suggestions cache served; 5) `SHELL: grep -ril firestore service/src service/package.json` -> empty. Sandbox: `commercetools connect deployment redeploy --key <deployment>` (needs M4) then same assertions. This proves persistence is outside the process and no Firestore remains.

**D15. V-05 (multi-instance).** `scripts/e2e/two-instance.mjs --a 8081 --b 8082 --listen 8080 --pin '/authorize=a,/callback=b'` starts two service processes with `INSTANCE_ID=a|b` (read via `/service/status` -> `instanceId`; amendment to C) and a proxy that logs `ts method path -> a|b`. Steps: I-03 flow ("Connect my account") via the tunnel to port 8080; assert popup closes, status connected, proxy log shows authorize on a and callback on b, `CO` read of `ai-assistant-identity-auth-states` has no remaining state object, second visit to callback URL -> error (I-06 semantic). Control run with `--pin ''` is round-robin to show no dependence. Needs I's real path names; read them from `specs/*/spec.md` of change I.

**D16. V-06 (budget).** Local: run service with `CHAT_REQUEST_BUDGET_MS=20000` and `CHAT_FINALIZE_RESERVE_MS=3000` (names from change H's docs list; re-check in its archived spec). Prompt: `e2e-budget: call at least 8 different documentation searches one after another and summarise each in a paragraph` (forces a long multi-step turn). Assertions: first byte < 30 s; stream ends by 25 s +/- 5; final assistant message part includes the graceful-finish notice text from H; `GET session/:id/messages` returns the persisted assistant message with the notice; no `error` frame; a follow-up `e2e-after-budget: say OK` succeeds in the same session. Sandbox variant is H-04 (about 4 min) re-run by V on the deployed URL plus `list_network_requests` duration < 300 s and no 502/504.

**D17. Regression order** (`e2e/02-regression-order.md`). Tier 0 preflight: V-01, V-08. Tier 1 smoke: C-01, O-01, O-04, D-01, P-01, P-02, R-01, S-01. Tier 2 persistence: E-01, E-02, G-01, G-02, P-06, P-13. Tier 3 chat features: H-01..H-03, P-03, P-07, P-08, P-10, P-14, P-15, G-03..G-05, G-08, F-01, J-01, K-01, L-01, L-03, M-01. Tier 4 identity and admin: V-13, I-01..I-07, Q-01..Q-06, N-01..N-04, G-06, J-02..J-06, P-09, P-11, P-12. Tier 5 apps: R-02..R-09, S-02..S-10, G-07. Tier 6 negative/security: V-02, V-03, V-10, V-11, V-12, V-13, D-02..D-05, O-02, O-03, O-05, L-02, L-05, M-02. Tier 7 destructive/slow: V-04, V-05, V-06, H-04, V-09, K-02, U-01..U-04. Tier 8: V-07 cleanup, report. Stop rules: tier 0 fail = BLOCKED; two consecutive fails in a tier = stop tier; destructive tier runs only after tiers 1-6 are green. Estimated duration: smoke 10 min, full local 90-120 min, sandbox extras 30 min.

**D18. Traceability** - see the table below; `e2e/03-traceability.md` carries it and the lint.

### Master traceability table (plans/01 rows -> scenario ids)

| # | Feature (plans/01) | Owner spec | Scenario ids |
|---|---|---|---|
| 1 | Express app, `/service` base, error middleware, request context, logger | C | C-01, V-08 |
| 2 | Boot-time config audit -> fail-fast env validation | C | C-02, F-02, D-05 |
| 3 | MC session auth (JWKS, audience, project guard) | D | D-01, D-02, D-03, V-02, O-02 |
| 4 | `POST /auth/session` bootstrap | D | D-01, O-01, O-03 |
| 5 | `MC_AUTH_DISABLED` dev bypass guarded | D | D-05 |
| 6 | Admin gating by `ADMIN_USER_IDS` (replaces the permission group) | D | D-04, V-03, V-12, V-13, O-03, G-06 |
| 7 | Session ownership by verified `userId` | D, G | G-01, G-02, V-03, V-12 |
| 8 | Settings object replacing project doc | E | E-02, V-04, G-06 |
| 9 | AES-GCM encryption of identity secrets | E | E-01, I-03, V-10 |
| 10 | Persistence repository over Custom Objects | E | E-01, E-03, V-04 |
| 11 | Sessions CRUD, messages, last-session, paging | G | G-01, G-02, P-04, P-05, P-06, P-13 |
| 12 | Session digest (title/description/icon/summary/chips) | G | G-03, P-04, P-08 |
| 13 | Prompt suggestions | G | G-04, P-01 |
| 14 | Feature flags via query (`customView`) | G, S | G-07, S-02, S-03 |
| 15 | Per-session tools menu (negative list) | G | G-05, P-07 |
| 16 | System prompt and tool-call-log endpoints | G | G-06, G-08, Q-03 |
| 17 | Chat stream endpoint, orchestrators, subagent tool, analyzer, prompts | H | H-01, H-02, P-02, P-03, S-03 |
| 18 | 5-minute budget guard | H | V-06, H-04 |
| 19 | 8 functional agents + image generation | H, J, K, L | H-02, J-01, J-02, J-03, J-04, K-01, L-01, L-03, M-01 |
| 20 | `visualize_data`, `export_data`, `create_entity_link` | H | H-03, P-10, L-04 |
| 21 | `create_composed_page` tool | M | M-01, M-02, M-03, P-11 |
| 22 | Gemini schema normalisation, tool-schema debug | H | H-02, F-01 |
| 23 | Vertex provider modules, token counting | F | F-01, F-03 |
| 24 | Identity-mode Managed MCP (OAuth+PKCE, tokens, binding, tools) | I | I-01..I-07, Q-01, V-05 |
| 25 | Knowledge MCP + developer-tips prompt | J | J-01 |
| 26 | Contentstack, Algolia, Stripe tool sources + read-only `GET /mcp/providers` status (credentials are Connect configuration) | J | J-02, J-03, J-04, J-05, J-06, Q-04 |
| 27 | Nimbus MCP embedded (child, respawn, readiness) | K | K-01, K-02, K-03 |
| 28 | BigQuery offload, `query_aggregated_data`, `get_table_info`, SQL guard | L | L-01, L-02 |
| 29 | GCS image upload and private image delivery | L | L-03, L-05, P-15 |
| 30 | Feedback submit/fetch with chunked snapshots | N | N-01, N-04, P-09 |
| 31 | Backoffice threads + is-admin | N | N-02, N-03, Q-06 |
| 32 | In-memory cache layer (optimisation only) | C | V-04, V-09 |
| 33 | Jest wire tests | all | V-08 |
| 34 | `forward-to.ts` x3 + drift check | O | O-02, V-08 |
| 35 | Chat surface, composer, parts, tool steps, charts, chips, typing indicator, motion | P | P-01..P-15 |
| 36 | Annotation / agentation preview | P | P-12 |
| 37 | Identity MCP "Connect my account" page | Q, I | Q-01, I-03, S-05 |
| 38 | Configuration panel (tool-call logs, system prompt, MCP provider status cards), admin-gated | Q | Q-02, Q-03, Q-04, Q-05, G-06, G-08 |
| 39 | Backoffice UI (threads, alaSQL, feedback list/detail) | Q | Q-06, N-02 |
| 40 | Composed pages (storage, Babel renderer, data sources) | M, P, R | R-01..R-09, P-11, M-01 |
| 41 | composed-apps application | R | R-01..R-09 |
| 42 | mc-view-app custom view (panel, locators, flags, read-only binding gate) | S | S-01..S-10 |
| 43 | Auth/bootstrap error gates (reauth dialog) | O, P | O-05, V-02 |
| 44 | Minimal i18n wiring, no console errors | O | O-01, O-04 |
| 45 | Session persistence/stateless service (R7, D1, D2) | E | V-04, V-05 |
| 46 | Connect deployment (R2, R6): apps load, two-phase, postDeploy | U | U-01, U-02, U-03, U-04, V-09 |
| 47 | Dropped features absent (team MCP, data warehouse toggle) | P, Q | V-11 |
| 48 | Secrets never in browser or logs | E, J | V-10, J-05 |

## Risks / Trade-offs

- **R1 SSO/2FA expiry** during long runs: preflight per tier, `BLOCKED(M8)` status.
- **R2 Tunnel instability** (local): INFRA classification, preflight repeated, sandbox as authoritative environment.
- **R3 Id drift** between concurrently authored changes: lint + reconciliation task 9.2.
- **R4 LLM variance / quota**: structural assertions, nonce soft checks, cost cap (`E2E_MAX_TURNS`).
- **R5 Evidence containing secrets/PII**: dummy values only, `--redactNetworkHeaders`, scrub step before commit, evidence git-ignored and never published (change X).
- **R6 Destructive scenarios** (restart, undeploy): tagged, last tier, require explicit `E2E_ALLOW_DESTRUCTIVE=1`.
- **R7 Agent cost/time**: tiers allow partial runs; smoke tier 10 min.
- **R8 Test hooks not delivered**: fallback to accessible-name selectors, which are less stable.
- **R9 Chrome profile restrictions** (finding 7) may require the autoConnect alternative.

## Open questions

- **RQ8** (DECIDED 2026-10-09, Q12/Q46): the owner provides a scratch commercetools project and TWO Merchant Center users, A (user id in `ADMIN_USER_IDS`) and B (not in it); both have the app's ordinary View/Manage permission through a Team. No permission editing fallback exists.
- **RQ9** (owner): which tunnel tool is installed/allowed (`cloudflared`, `ngrok`)? Default: `cloudflared`.
- Verify during implementation: exact request header names used by `forward-to` (change O), the callback and authorize paths (change I), the stream-budget variable (change H), the `data-testid` hooks actually delivered (P, Q, S), whether `mc-scripts start` accepts a port option for three simultaneous apps.

## Changelog

- 2026-10-09 (owner decision Q4): provider credential forms no longer exist; J-05/J-06, Q-02/Q-04 and the V-03/V-10 secret scans now cover read-only status cards and dummy provider keys deployed through Connect configuration (`configure`); inventory rows 9, 26 and 38 updated.
- 2026-10-09 (owner decision Q9): image scenarios no longer expect a signed bucket URL. L-03 asserts the image renders in the default `private` mode through `GET /service/files/...` loaded with `forwardToFetch` into a `blob:` URL; new L-05 (tier 6) asserts an unauthenticated direct bucket URL is 403 and that a second user cannot load another user's image (404).
- 2026-10-09 (owner decision Q9, cont.): reuse list of change P scenarios grows to P-01..P-15 (P-15 private image displays through the backend); traceability row 35/29 updated.
- 2026-10-09 (owner decisions: admin = `ADMIN_USER_IDS` only, Q12/Q46, Q7): the two-Teams/permission-group test setup is replaced by two Merchant Center users (admin user A whose user id is in `ADMIN_USER_IDS`, non-admin user B); V-03 tests the non-admin user (403 `ADMIN_REQUIRED`, admin UI hidden) with no permission editing; V-12 = forged e-mail, label or header never grants admin; V-13 = own user ID line and administrator bootstrap (empty list means nobody, `configure ADMIN_USER_IDS=<id>` redeploy, admin surfaces appear after refresh, optional comma-list check U10); the admin sign-in card E2E-I-00, the e-mail-claim probe, sign-in expiry and the clock helper are removed; the legacy widget route absence check is removed from V-11 (feature dropped).
