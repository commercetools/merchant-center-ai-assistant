# Playbook V: cross-cutting scenarios

Owned by change `v-e2e-chrome-testing` (ids `E2E-V-01` to `E2E-V-13`). These scenarios do not belong
to one feature: the preflight, authentication failure, the non-admin user, forged hints, the
administrator bootstrap, restart persistence, multi-instance safety, the time budget, hygiene gates,
cold start, the secret scan and the dropped-feature check. Users: **user A** is the administrator (its
Merchant Center user id is in `ADMIN_USER_IDS`), **user B** the non-admin user. No permission or Team
is edited by any card. User ids are replaced by `<user-id-a>` and `<user-id-b>` in evidence.

### E2E-V-01 - Preflight: attachment, host, project, login
- Spec: v-e2e-chrome-testing / attaching to a logged-in browser, wrong project
- Tags: smoke, needs:M8
- Env: both
- Budget: 120
- Pre: Chrome started with the debugging port and logged in once (manual step M8); the MCP server points at it; `e2e/.env.e2e` is filled.
- Steps:
  1. mcp__chrome-devtools__list_pages {}
  2. mcp__chrome-devtools__new_page {url: "$E2E_MC_HOST/$E2E_PROJECT_KEY/dashboard"}
  3. mcp__chrome-devtools__list_pages {}
  4. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Dashboard", "Welcome"], timeout: 30000}
  5. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({url: location.href, host: location.host, path: location.pathname})"}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-01/snapshot-final.txt"}
  7. SHELL: `curl -sf "$SERVICE_URL/service/status"`
  8. SHELL: `curl -s http://127.0.0.1:9222/json/version`
- Assert:
  A1 [DOM] `list_pages` returns at least one page; the page URL starts with `$E2E_MC_HOST/$E2E_PROJECT_KEY`, the host equals the host of `$E2E_MC_HOST` and the URL is not a login page; otherwise the run stops with `BLOCKED(M8)` and no later card runs.
  A2 [DOM] the project key in the URL is not in `E2E_PROJECT_DENYLIST` and equals `E2E_PROJECT_KEY`; a mismatch aborts the run before any write (wrong project).
  A3 [DOM] the logged-in user's name is read from the snapshot (the selector of the user menu is unverified; use the snapshot text) and recorded in `report.md` with the project key.
  A4 [SHELL] the status answers 200 with `status: "UP"`; step 8 prints JSON with `Browser`.
  A5 [SHELL] the service and the Merchant Center host belong to the same region as `E2E_REGION`; the run does not assert on the string `europe-west1` that logs may print wrongly.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png, preflight.json
- Status: NOT RUN

### E2E-V-02 - Authentication failure
- Spec: v-e2e-chrome-testing / authentication failure scenario
- Tags: smoke, negative, needs:M8
- Env: both
- Budget: 480
- Pre: `E2E-V-01` passed; `scripts/e2e/make-bad-jwt.mjs` available.
- Steps:
  1. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session"`
  2. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session" -H "Authorization: Bearer abc.def.ghi"`
  3. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session" -H "Authorization: Bearer $(node scripts/e2e/make-bad-jwt.mjs)"`
  4. SHELL: `curl -si "$SERVICE_URL/service/status"`
  5. mcp__chrome-devtools__new_page {url: "$APP_URL", isolatedContext: "e2e-anon"}
  6. mcp__chrome-devtools__list_pages {}
  7. mcp__chrome-devtools__wait_for {pageId: <anon page id>, text: ["Log in", "Sign in"], timeout: 30000}
  8. mcp__chrome-devtools__list_network_requests {pageId: <anon page id>, resourceTypes: ["fetch"], pageSize: 50}
  9. mcp__chrome-devtools__close_page {pageId: <anon page id>}
  10. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL", initScript: "const f = window.fetch; window.fetch = (i, o) => String((i && i.url) || i).includes('/proxy/forward-to') ? Promise.resolve(new Response('{}', {status: 401})) : f(i, o);"}
  11. mcp__chrome-devtools__wait_for {pageId: $P, text: ["session has expired", "Sign in again"], timeout: 30000}
  12. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-02/snapshot-mc-app.txt"}
  13. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$VIEW_URL", initScript: "const f = window.fetch; window.fetch = (i, o) => String((i && i.url) || i).includes('/proxy/forward-to') ? Promise.resolve(new Response('{}', {status: 401})) : f(i, o);"}
  14. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-02/snapshot-view.txt"}
  15. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL"}
- Assert:
  A1 [SHELL] part A: steps 1 to 3 answer 401, no body contains `at ` stack lines, `Error:` text, a token or the expected audience; step 4 answers 200.
  A2 [DOM] part B: in the cookie-free context the Merchant Center login page is shown (the URL contains `/login`).
  A3 [NET] part B: no 2xx response to a `forward-to` request in the isolated page.
  A4 [DOM] part C: `mc-app` shows the expired-session state with the text "session has expired", the button "Sign in again" and a Retry action.
  A5 [DOM] part C: `mc-view-app` shows "Your Merchant Center session has expired" with "Sign in again" and Retry (an error with Retry, never a blank panel).
- Cleanup: close the isolated page (step 9); reload the app without the init script (step 15; the script applies to the next navigation only).
- Evidence: negatives.txt, snapshot-mc-app.txt, snapshot-view.txt, screenshot-final.png
- Status: NOT RUN

### E2E-V-03 - The non-admin user cannot use admin functions
- Spec: v-e2e-chrome-testing / non-allowlisted user scenario
- Tags: smoke, negative, needs:M8, needs:second-user
- Env: both
- Budget: 600
- Pre: user B logged in on port 9223 (`chrome-devtools-b`); `ADMIN_USER_IDS` contains user A's id only (`E2E-V-13` ran, or the deployment is configured); dummy provider keys deployed (`sk_test_e2edummykey`); no permission is edited. Marked SKIPPED(M10) when `E2E_SECOND_USER=0`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO CAPTURE-FORWARD
  3. MACRO REPLAY-FORWARD POST /auth/session null null
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-03/snapshot-nav.txt"}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-03/snapshot-backoffice.txt"}
  7. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => document.documentElement.innerHTML.includes('sk_test_e2edummykey') || document.documentElement.innerHTML.includes('e2e-dummy-key')"}
  8. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-v03"} null
  9. MACRO REPLAY-FORWARD GET /backoffice/threads/00000000-0000-0000-0000-000000000000 null null
  10. MACRO REPLAY-FORWARD PUT /managed-mcp-identity {"serverKey":"e2e-ai-assistant"} null
  11. MACRO REPLAY-FORWARD GET /session/all null null
  12. MACRO REPLAY-FORWARD GET /system-prompt null null
- Assert:
  A1 [NET] the bootstrap (step 3) has `isAdmin: false`.
  A2 [DOM] the navigation shows no admin item (settings write, system prompt, tool-call-log mode, backoffice, feedback review, Managed MCP setup, Connections); the config panel shows read-only status cards without Save; the "Your user ID" line shows user B's id.
  A3 [DOM] direct navigation to `$APP_URL/backoffice` shows "Administrator access required".
  A4 [DOM] step 7 returns false: no secret value in the DOM.
  A5 [NET] steps 8, 9 and 10 answer 403 with `code: "ADMIN_REQUIRED"`; steps 11 and 12 answer 200 and the system prompt is unchanged.
- Cleanup: none (nothing was written).
- Evidence: replay-results.json, snapshot-nav.txt, snapshot-backoffice.txt (ids scrubbed)
- Status: NOT RUN

### E2E-V-04 - Persistence across a service restart
- Spec: v-e2e-chrome-testing / persistence across service restart
- Tags: regression, destructive, needs:M8, needs:service-account
- Env: both (local by killing the process, sandbox by redeploy)
- Budget: 900
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; user A is an administrator and, if possible, connected to the identity MCP.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-restart-<nonce>: reply with one short sentence"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. MACRO CAPTURE-FORWARD
  5. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-sp-<nonce>"} null
  6. MACRO SERVICE-RESTART (local; on the sandbox skip it and run step 7 instead)
  7. SHELL: `commercetools connect deployment redeploy --key <deployment key>` (sandbox only, needs manual step M4; the helper script has no plain redeploy command)
  8. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload", timeout: 90000}
  9. mcp__chrome-devtools__wait_for {pageId: $P, text: ["e2e-restart-<nonce>"], timeout: 90000}
  10. MACRO CAPTURE-FORWARD
  11. MACRO REPLAY-FORWARD GET /system-prompt null null
  12. MACRO REPLAY-FORWARD GET /managed-mcp-identity/status null null
  13. SHELL: `grep -ril firestore service/src service/package.json connect.yaml || echo none`
- Assert:
  A1 [DOM] after the restart the session is in the Chats drawer and the transcript shows the nonce message.
  A2 [NET] `GET /system-prompt` returns `e2e-sp-<nonce>`.
  A3 [NET] the identity status still reports `connected: true` when it was connected before.
  A4 [SHELL] step 13 prints `none` (no Firestore anywhere in the service source or configuration).
  A5 [NET] the suggestions cache is served after the restart (soft, recorded).
- Cleanup: restore the system prompt; delete the session.
- Evidence: snapshot-final.txt, restart-log.txt, replay-results.json
- Status: NOT RUN

### E2E-V-05 - Multi-instance: authorize on one instance, callback on another
- Spec: v-e2e-chrome-testing / multi-instance safety
- Tags: regression, destructive, needs:M8, needs:deployment
- Env: local (two processes behind a path-pinned proxy)
- Budget: 900
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; a bound identity-mode server (`E2E-I-02`); the user is disconnected. The instance id that the V design asked change C to add to `/service/status` does not exist, so the proxy log is the authority on which instance served which request.
- Steps:
  1. SHELL: `node scripts/e2e/two-instance.mjs --a 8081 --b 8082 --listen 8080 --pin '/authorize=a,/callback=b'` (in the background, writes `plans/evidence/$RUN/proxy.log`)
  2. MACRO OPEN-APP $APP_URL
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Connect my account">}
  4. mcp__chrome-devtools__list_pages {}
  5. mcp__chrome-devtools__select_page {pageId: <popup page id>, bringToFront: true}
  6. mcp__chrome-devtools__click {pageId: <popup page id>, uid: <uid of the consent button, only when asked>}
  7. mcp__chrome-devtools__select_page {pageId: $P, bringToFront: true}
  8. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…"], timeout: 60000}
  9. SHELL: `cat plans/evidence/$RUN/proxy.log`
  10. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-identity-auth-states`
  11. SHELL: control run: restart the proxy with `--pin ''` (round robin) and repeat steps 2 to 8 after disconnecting
- Assert:
  A1 [DOM] the popup closes and the app shows the connected state.
  A2 [SHELL] the proxy log shows the `authorize` request served by instance `a` and the `callback` request served by instance `b`.
  A3 [CO] the single-use state object is gone after the flow.
  A4 [NET] a second request of the callback URL answers "already used or expired" (400 page) and makes no second token exchange (see `E2E-I-06`).
  A5 [SHELL] the control run also connects with round-robin routing (no dependence on which instance serves which request).
- Cleanup: stop the two instances and the proxy; disconnect or unbind as the following cards need.
- Evidence: proxy.log, co-states.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-V-06 - Five-minute budget behaviour
- Spec: v-e2e-chrome-testing / five-minute budget behaviour
- Tags: slow, destructive, needs:M8, needs:service-account
- Env: both (local with a reduced budget, sandbox with a long turn)
- Budget: 900
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; local: the service restarted with `CHAT_REQUEST_BUDGET_MS=20000 CHAT_FINALIZE_RESERVE_MS=3000` (the variables of change H; the reserve has a minimum, if 3000 is refused use the smallest accepted value and record it).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-budget: call at least 8 different documentation searches one after another and summarise each in a paragraph"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  5. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => performance.getEntriesByType('resource').filter(e => e.name.includes('forward-to')).map(e => ({start: Math.round(e.startTime), durationMs: Math.round(e.duration), responseStart: Math.round(e.responseStart - e.startTime)}))"}
  6. MACRO REPLAY-FORWARD GET /session/<sessionId>/messages null null
  7. MACRO SEND text="e2e-after-budget: say OK"
  8. MACRO WAIT-STREAM-DONE timeoutMs=120000
- Assert:
  A1 [NET] local: first byte arrives under 30 s and the stream ends by 25 s (plus or minus 5) with a finish indication and no `error` chunk.
  A2 [DOM] the last assistant message shows the notice "The time limit for a single reply was reached".
  A3 [NET] `GET /messages` returns the persisted assistant message including the notice.
  A4 [NET] the follow-up in step 7 succeeds in the same session.
  A5 [NET] sandbox: re-run `E2E-H-04` against the deployed URL; the long stream shows a duration under 300 s and no 502 or 504.
- Cleanup: restore the default budget variables and restart; delete the session.
- Evidence: timing.json, stream.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-V-07 - Fixtures and cleanup leave nothing behind
- Spec: v-e2e-chrome-testing / fixtures and cleanup, orphan sweep
- Tags: smoke, shell
- Env: both
- Budget: 300
- Pre: the run finished; the ledger `plans/evidence/$RUN/ledger.jsonl` lists created sessions and objects.
- Steps:
  1. SHELL: `node scripts/e2e/cleanup.mjs --run $RUN`
  2. SHELL: `node scripts/e2e/cleanup.mjs --run $RUN`
  3. SHELL: `node scripts/e2e/cleanup.mjs --sweep --dry-run`
  4. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant- --marker e2e-`
- Assert:
  A1 [SHELL] the second run of step 2 reports `deleted: 0` and exits 0 (idempotent).
  A2 [SHELL] step 3 lists no `e2e-` object older than the sweep age and step 4 finds no object with an `e2e-` marker (settings, tokens of real users and objects without the marker are never touched).
  A3 [SHELL] the cleanup guard refuses any key that does not start with `e2e-` (the unit test `scripts/tests/e2e-cleanup.test.mjs` passes).
- Cleanup: none.
- Evidence: cleanup-1.txt, cleanup-2.txt, sweep.txt
- Status: NOT RUN

### E2E-V-08 - Gates: tests, checks and validation
- Spec: v-e2e-chrome-testing / service test gates
- Tags: smoke, shell
- Env: local
- Budget: 1800
- Pre: dependencies installed (`cd scripts && npm ci`, `cd service && npm ci`, each frontend `yarn install --frozen-lockfile`); Docker running for `connect validate`.
- Steps:
  1. SHELL: `cd service && npm run build && npm test && npm run lint && npm run typecheck && npm run check:foundation`
  2. SHELL: `node --test scripts/tests/*.test.mjs`
  3. SHELL: `node scripts/spdx-check.mjs && node scripts/check-repo-rules.mjs && node scripts/check-connect-layout.mjs && node scripts/check-duplicates.mjs && node scripts/check-versions.mjs && node scripts/check-frontend-leftovers.mjs`
  4. SHELL: `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace --tiers`
  5. SHELL: `for app in mc-app composed-apps mc-view-app; do (cd $app && yarn typecheck && yarn lint); done`
  6. SHELL: `commercetools connect validate`
- Assert:
  A1 [SHELL] every command exits 0 (the jest wire tests of all changes are part of step 1).
  A2 [SHELL] no `.github/workflows` directory exists (`ls .github 2>/dev/null` prints nothing).
  A3 [SHELL] step 6 passes; when Docker is not available the result is SKIPPED(M14).
- Cleanup: none.
- Evidence: gates.txt (exit codes and last lines)
- Status: NOT RUN

### E2E-V-09 - Cold start after scale-to-zero
- Spec: v-e2e-chrome-testing / cold start
- Tags: slow, needs:M8, needs:deployment
- Env: sandbox
- Budget: 2400
- Pre: the sandbox deployment is idle for about 20 minutes (scale to zero); no request is made during the wait.
- Steps:
  1. SHELL: `date +%s > /tmp/e2e-cold-start.txt; curl -s -o /dev/null -w "%{http_code} %{time_total}" "$SERVICE_URL/service/status"`
  2. MACRO OPEN-APP $APP_URL
  3. MACRO NEW-CHAT
  4. MACRO SEND text="e2e-v09: reply with one short sentence"
  5. MACRO WAIT-STREAM-DONE timeoutMs=180000
- Assert:
  A1 [SHELL] the first `/service/status` answers 200 in under 60 s (about 15 s expected).
  A2 [DOM] the first message after the cold start completes.
  A3 [SHELL] in-memory caches (settings, JWKS) rebuild without errors; the log of the cold start has no error lines.
- Cleanup: delete the session.
- Evidence: cold-start.json, snapshot-final.txt
- Status: NOT RUN

### E2E-V-10 - Secrets never reach the browser
- Spec: v-e2e-chrome-testing / secrets scan
- Tags: regression, negative, needs:M8, needs:secrets
- Env: both
- Budget: 900
- Pre: dummy provider keys deployed through Connect configuration: `STRIPE_SECRET_KEY=sk_test_e2edummykey`, `ALGOLIA_MCP_URL=https://e2e-dummy.example.org/mcp`, `CONTENTSTACK_API_KEY=e2e-dummy-key`, `CONTENTSTACK_MANAGEMENT_TOKEN=e2e-dummy-token`; user A performs a full admin tour (open the app, Settings, Connected sources, backoffice, a chat turn, the tools panel, feedback).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 200}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <each forward-to request>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-V-10/resp-<n>.json"}
  4. SHELL: `grep -rlE "sk_test_e2edummykey|e2e-dummy-key|e2e-dummy-token|e2e-dummy.example.org|BEGIN PRIVATE KEY|private_key|Bearer [A-Za-z0-9._-]{20,}" "$TMPDIR/e2e/$RUN/E2E-V-10" || echo clean`
  5. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({dom: /sk_test_e2edummykey|e2e-dummy-key|e2e-dummy-token/.test(document.documentElement.innerHTML), storage: /sk_test_e2edummykey|e2e-dummy-key|e2e-dummy-token/.test(JSON.stringify(localStorage) + JSON.stringify(sessionStorage))})"}
- Assert:
  A1 [SHELL] step 4 prints `clean`: no secret value, no PEM or private-key marker, and no base64 service-account marker (`eyJ0eXBlIjoic2VydmljZV9hY2NvdW50`) in any recorded response.
  A2 [DOM] step 5 reports no hit in the DOM or in browser storage.
  A3 [NET] `GET /mcp/providers` has names and booleans only (`E2E-Q-14`); the stored token objects are encrypted envelopes (`E2E-E-01`).
- Cleanup: delete the recorded response files after the scan (they may contain session data).
- Evidence: scan-result.txt (counts and file names only)
- Status: NOT RUN

### E2E-V-11 - Dropped features are absent
- Spec: v-e2e-chrome-testing / dropped features absent
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 300
- Pre: users A and B (any); the three apps open in turn.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-11/snapshot-settings.txt"}
  3. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 100}
  4. MACRO REPLAY-FORWARD GET /mcp/configs null null
  5. MACRO REPLAY-FORWARD GET /widget/config/x null null
- Assert:
  A1 [DOM] the snapshots of every screen (chat, Chats, Pages, Settings, Connections, backoffice) contain neither "Team MCP" nor "Data Warehouse".
  A2 [NET] no request carries the header `x-mc-team-id` or a `data-warehouse` path.
  A3 [NET] step 4 answers 404 (credential CRUD dropped); step 5 answers 404 (the widget bootstrap is dropped, recorded for information).
- Cleanup: none.
- Evidence: snapshot-settings.txt, network.json
- Status: NOT RUN

### E2E-V-12 - A forged e-mail, label or header never grants admin
- Spec: v-e2e-chrome-testing / forged e-mail, label or header never grants admin
- Tags: smoke, negative, needs:M8, needs:second-user, needs:service-account
- Env: both
- Budget: 900
- Pre: user A on `chrome-devtools`, user B on `chrome-devtools-b`; `ADMIN_USER_IDS` has user A only; user A's label is read from the backoffice (never invented). User ids are read at run time.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO CAPTURE-FORWARD
  3. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-v12"} {"x-admin-email":"admin@example.invalid","x-user-email":"admin@example.invalid","x-user-id":"<user-id-a>"}
  4. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-v12","userEmail":"admin@example.invalid","email":"admin@example.invalid","userLabel":"<label of A>","userId":"<user-id-a>","isAdmin":true} null
  5. MACRO REPLAY-FORWARD PUT /system-prompt?userEmail=admin@example.invalid {"systemPrompt":"e2e-v12"} null
  6. MACRO REPLAY-FORWARD POST /backoffice/threads {"userEmail":"admin@example.invalid","userId":"<user-id-a>","isAdmin":true} {"x-admin-email":"admin@example.invalid"}
  7. MACRO REPLAY-FORWARD POST /session {"userLabel":"<label of A>","userId":"<user-id-a>"} null
  8. MACRO REPLAY-FORWARD POST /feedback/submit {"sessionId":"<session of step 7>","comment":"e2e-v12","userLabel":"<label of A>"} null
  9. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-sessions <session of step 7>`
  10. MACRO OPEN-APP $APP_URL
  11. MACRO REPLAY-FORWARD GET /session/all null null
  12. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  13. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-12/snapshot-backoffice.txt"}
- Assert:
  A1 [NET] steps 3 to 6 (as user B) answer 403 with `code: "ADMIN_REQUIRED"` and the stored prompt is unchanged.
  A2 [CO] step 9: the stored session owner is user B's `userId` (the check compares ids and prints only match or mismatch), not user A's.
  A3 [NET] steps 10 and 11 (as user A): user A's session list does not contain the session created in step 7.
  A4 [DOM] the backoffice (as user A) shows the label of that session or feedback marked "(unverified)" as plain text, without a link.
  A5 [NET] no response contains the forged address.
- Cleanup: delete the session and feedback created (`cleanup.mjs --run $RUN`); remove any planted `localStorage` key.
- Evidence: replay-results.json, owner-check.txt, snapshot-backoffice.txt (ids and labels scrubbed)
- Status: NOT RUN

### E2E-V-13 - Own user ID and administrator bootstrap
- Spec: v-e2e-chrome-testing / own user ID and administrator bootstrap
- Tags: smoke, destructive, needs:M8, needs:second-user, needs:deployment
- Env: both (local: restart the service with the value; sandbox: `configure`)
- Budget: 1200
- Pre: M10 done, users A and B logged in; `E2E_ALLOW_DESTRUCTIVE=1`; `ADMIN_USER_IDS` empty or unset (a fresh deployment or a `.env.local` without the key). Record the previous value to restore it.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "About">}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-13/snapshot-about-a.txt"}
  6. MACRO CAPTURE-FORWARD
  7. MACRO REPLAY-FORWARD POST /auth/session null null
  8. SHELL: `curl -s "$SERVICE_URL/service/status"`
  9. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-v13"} null
  10. SHELL: `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id of A copied from the line>` (local: restart the service with the value in the environment)
  11. SHELL: `node scripts/connect/connect.mjs status` (wait for `Deployed`)
  12. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload", timeout: 90000}
  13. MACRO CAPTURE-FORWARD
  14. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-v13"} null
  15. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-V-13/snapshot-admin-a.txt"}
  16. SHELL: optional rehearsal of the comma list: `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id of A>,<id of B>`, wait, reload as both users, then `configure ADMIN_USER_IDS=<id of A>` again
- Assert:
  A1 [DOM] as user A and as user B (repeat steps 1 to 7 on `chrome-devtools-b`) a read-only "Your user ID" line is present and equals `userId` of that user's own `POST /auth/session` response; the two values differ; the same line is in the `mc-view-app` panel footer when the surface shows it (else SKIPPED(note) for that part).
  A2 [NET] with the list empty both users have `isAdmin: false`, step 9 answers 403 `ADMIN_REQUIRED`, `/service/status` shows `adminConfigured: false` and the start log contains `ADMIN_USER_IDS is empty: no administrator`.
  A3 [NET] after step 11 and a reload, user A has `isAdmin: true`, the admin surfaces are visible and step 14 answers 200; user B stays `isAdmin: false` and gets 403.
  A4 [NET] the optional rehearsal shows that a comma-separated value is parsed as two ids and both users become administrators; restored afterwards.
- Cleanup: restore `ADMIN_USER_IDS` to user A only (or empty for the next fresh run) and restore the system prompt.
- Evidence: snapshot-about-a.txt, snapshot-admin-a.txt, replay-results.json (ids replaced by placeholders)
- Status: NOT RUN

## Coverage

- `E2E-V-01` to `E2E-V-13` cover: preflight and wrong-project abort, authentication failure, non-admin user, restart persistence, multi-instance PKCE safety, budget behaviour, cleanup, gates, cold start, secret scan, dropped features, forged hints, user id and administrator bootstrap.
- Not covered: the Merchant Center permission screens (never edited by the framework).
