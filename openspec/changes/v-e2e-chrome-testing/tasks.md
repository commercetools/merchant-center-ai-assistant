## 0. Read first

- [x] 0.1 Read `proposal.md`, `design.md` (Explore findings 1-8, Decisions D1-D18 including the traceability table) and `specs/e2e-chrome-testing/spec.md`.
- [x] 0.2 Read `plans/04-workflow.md` sections 4-5, `plans/manual-steps.md` (M3, M4, M8-M11) and `plans/00-overview.md` R9.
- [x] 0.3 Read the Chrome scenario bullets of every finished change: `grep -rn "E2E-" openspec/changes/*/tasks.md openspec/changes/archive/*/tasks.md`.
- [ ] 0.4 Read the Chrome DevTools MCP README https://github.com/ChromeDevTools/chrome-devtools-mcp (tool reference, `--browserUrl`, `--workspace`, `--redactNetworkHeaders`) and run `npx -y chrome-devtools-mcp@latest --help` to confirm the flags.
- [ ] 0.5 Skim `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md` (frontend features) and `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/FEATURES.md` (backend features) - they are the source of "what to prove".

You should now be able to explain: (a) the card format, (b) why every tool call needs `pageId`, (c) how the agent gets a logged-in browser, (d) why the five cross-cutting scenarios are owned by V, (e) what "assert structure, not wording" means.

## 1. Setup

- [ ] 1.1 Branch and prerequisite check.
  **Why:** V needs everything else implemented.
  **Where:** `/Users/behnam/code/commercetools-labs/ai-assistant`.
  **How:** `git switch -c spec/v-e2e-chrome-testing`; `ls service mc-app composed-apps mc-view-app scripts`; `node -v` (v22); confirm `service/.env.local` exists (M3) with `CTP_*` and `GCP_SA_KEY_BASE64` (do NOT print them: `grep -c GCP_SA_KEY_BASE64 service/.env.local` prints `1`).
  **Done when:** all directories exist; the count is 1.
  **Watch out:** never `cat` env files into the chat.

- [ ] 1.2 Attach Chrome (manual step M8, agent prepares everything).
  **Why:** SSO/2FA cannot be automated, the login must survive between runs.
  **Where:** `e2e/README.md` section "Attach to Chrome" (written in 2.1) and the owner's MCP configuration.
  **How:** 1. Show the owner these commands (macOS): `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/ai-assistant-e2e-chrome"`; then in that window log in to `https://mc.us-central1.gcp.commercetools.com` as user A (the admin user) and open the scratch project. Repeat once with `--remote-debugging-port=9223 --user-data-dir="$HOME/.cache/ai-assistant-e2e-chrome-b"` and log in as the non-admin user (both users exist after manual step M10); each profile is logged in once. 2. Ask the owner to set the MCP server args to `chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222 --redactNetworkHeaders --workspace=/Users/behnam/code/commercetools-labs/ai-assistant/plans/evidence` and restart the Claude Code session; add a second MCP server entry `chrome-devtools-b` with `--browserUrl=http://127.0.0.1:9223` for the non-admin user. 3. `curl -s http://127.0.0.1:9222/json/version` must print JSON with `Browser`. 4. Verify the claim in design finding 7 (Chrome refuses the debugging port on the default profile) with the installed version and correct `README.md` if wrong.
  **Done when:** `mcp__chrome-devtools__list_pages` returns the MC page and `curl` prints JSON.
  **Watch out:** this step needs the owner once; record it as M8 (+M8a for the MCP config) in the manual steps file.

- [x] 1.3 Create `e2e/.env.e2e.example` and `.gitignore` entries.
  **Why:** one place for environment switches.
  **Where:** `e2e/.env.e2e.example`, root `.gitignore` (add `e2e/.env.e2e`, `plans/evidence/`).
  **How:** keys: `E2E_ENV=local|sandbox`, `E2E_PROJECT_KEY`, `E2E_MC_HOST=https://mc.us-central1.gcp.commercetools.com`, `E2E_REGION=gcp-us`, `SERVICE_URL`, `APP_URL`, `PAGES_URL`, `VIEW_URL`, `HOST_PAGE_URL` (a product page for S), `E2E_ALLOW_DESTRUCTIVE=0`, `E2E_MAX_TURNS=60`, `E2E_SECOND_USER=0` (1 when the non-admin user's Chrome on port 9223 is logged in), `E2E_ADMIN_BROWSER_URL=http://127.0.0.1:9222`, `E2E_NONADMIN_BROWSER_URL=http://127.0.0.1:9223`, `E2E_TUNNEL=cloudflared`. Use obviously fake values.
  **Done when:** `git check-ignore e2e/.env.e2e plans/evidence/x` prints both.
  **Watch out:** no real project keys or URLs in the example.

## 2. Framework documents

- [x] 2.1 `e2e/README.md`.
  **Why:** entry point for any agent.
  **Where:** `e2e/README.md`.
  **How:** sections: Purpose; Prerequisites (M3, M4, M8, M10); Attach to Chrome (design D5); Environments (D6 table local vs sandbox, with commands); Running a tier; Evidence layout; Safety rules (design spec "Safety of the test run"); Index of playbooks; FAQ.
  **Done when:** every playbook file name from the proposal is linked.
  **Watch out:** no customer names or internal hosts; unsupported-labs wording is not needed here.

- [x] 2.2 `e2e/00-conventions.md`.
  **Why:** the contract that makes cards lintable.
  **Where:** `e2e/00-conventions.md`.
  **How:** paste the card template (design D2); id rules; tags; oracle definitions; status values PASS/FAIL/SKIPPED(reason)/BLOCKED(reason)/FLAKE-PASS; LLM rules (D9) with timeouts; selector policy and the `data-testid` list (D10); safety (dummy secrets, project denylist check).
  **Done when:** a reviewer can write a valid card from this file alone.
  **Watch out:** keep exact tool names (`mcp__chrome-devtools__take_snapshot`), every call with `pageId`.

- [x] 2.3 `e2e/01-macros.md`.
  **Why:** avoid repeating 10-step sequences.
  **Where:** `e2e/01-macros.md`.
  **How:** define macros with numbered tool calls: `ATTACH` (`list_pages`; pick MC page; `select_page`), `OPEN-APP(url)` (`navigate_page` -> `wait_for` app heading -> `take_snapshot`), `NEW-CHAT`, `SEND(text)` (`take_snapshot`; `click` composer uid; `type_text{text, submitKey:"Enter"}`; or `press_key Enter`), `WAIT-STREAM-DONE(timeoutMs)` (poll `evaluate_script` reading `[data-testid=chat-status]` `data-status` until `ready`, fallback: `wait_for` the absence is not supported so poll snapshot for the stop button), `ASSERT-CLEAN` (`list_console_messages{types:["error"]}` filtered to app origin = 0; `list_network_requests{resourceTypes:["fetch"]}` has no 4xx/5xx except expected), `RECORD-SESSION` (read id from `POST session` via `get_network_request` -> `ledger.mjs add session <id>`), `REPLAY-FORWARD(method,path,body)` (design D11), `EVIDENCE(name)` (`take_snapshot{filePath}`, `take_screenshot{filePath}`), `COLLECT`.
  **Done when:** every macro has all required parameters in each call.
  **Watch out:** `uid` values come from the latest snapshot only - re-snapshot after DOM changes.

- [x] 2.4 Id/trace lint script.
  **Why:** keep ids consistent across concurrently authored changes.
  **Where:** `scripts/e2e/extract-scenario-ids.mjs`.
  **How:** node script (no deps) with modes `--list` (print ids found in `openspec/changes/*/tasks.md`, archive and `e2e/*.md`), `--lint` (cards complete: required bullet keys `Spec, Tags, Env, Budget, Pre, Steps, Assert, Cleanup, Evidence`; unique ids; regex `^E2E-[A-Z]-\d{2}[a-z]?$`), `--dangling` (ids mentioned in tasks without a card), `--trace` (parse the table in `e2e/03-traceability.md`; each row has >= 1 id; every id has a card; row count equals the number of KEEP/CHANGE rows counted from `plans/01-source-inventory.md` tables - count rows whose verdict column starts with KEEP or CHANGE).
  **Done when:** `node scripts/e2e/extract-scenario-ids.mjs --list` prints ids and exit code 0; unit test file `scripts/e2e/extract-scenario-ids.test.mjs` run with `node --test`.
  **Watch out:** ids like `E2E-I-05b` have a letter suffix.

## 3. Helper scripts

- [ ] 3.1 `scripts/e2e/dev-up.sh` and `dev-down.sh`.
  **Why:** one command for the local environment.
  **Where:** `scripts/e2e/dev-up.sh`, `dev-down.sh`.
  **How:** `set -euo pipefail`; start tunnel (`cloudflared tunnel --url http://localhost:8080 2>&1 | tee .e2e-tunnel.log` in background, parse the public tunnel URL from that log); export `MC_AUDIENCE=<tunnel>/service`-style value as required by the audience policy (read the exact variable and format from `service/src/config` / change D docs); start service (`npm run start:dev` or name from change C) in background writing `.e2e-service.pid`; wait for `curl -sf $SERVICE_URL/service/status`; start the three apps with `mc-scripts start` (ports from task 3.2) writing pids; write `e2e/.env.e2e`; options `--service-only`, `--no-apps`; `dev-down.sh` kills pids and tunnel.
  **Done when:** `bash scripts/e2e/dev-up.sh && curl -sf "$SERVICE_URL/service/status"` prints status JSON; `dev-down.sh` leaves no listening ports 8080/3001-3003 (`lsof -i :8080` empty).
  **Watch out:** tunnel URL changes each time, so `MC_AUDIENCE` and the app env `CHAT_SERVICE_ENDPOINT_URL` must be rewritten and the apps restarted.

- [ ] 3.2 Three apps in parallel.
  **Why:** `mc-scripts start` defaults to port 3001 for each.
  **Where:** `scripts/e2e/dev-up.sh`, `README.md` of each app (note).
  **How:** run `npx mc-scripts start --help` in `mc-app`; find the port option (flag `--port`? env `PORT`?); if none, run apps one at a time and document `E2E_APPS=mc-app|composed-apps|mc-view-app` selection in `dev-up.sh`. Record the finding.
  **Done when:** the chosen mechanism is documented in `e2e/README.md` and works for at least two apps simultaneously, or the sequential mode is documented.
  **Watch out:** the MC Custom Application registration (M6) has a single dev URL; confirm which port the registered "development" URL uses.

- [ ] 3.3 `seed.mjs`, `ledger.mjs`, `cleanup.mjs`.
  **Why:** fixtures and idempotent cleanup (design D8).
  **Where:** `scripts/e2e/seed.mjs`, `ledger.mjs`, `cleanup.mjs`, `lib/ct-client.mjs`.
  **How:** `lib/ct-client.mjs`: client credentials flow using `CTP_*` from `service/.env.local` via `fetch` (no SDK needed); `seed.mjs composed-pages` creates five objects in container from change M (default `shared-composed-pages`) keys `e2e-orders`, `e2e-draft`, `e2e-broken`, `e2e-bq` (data source `target: "BIG_QUERY"`), `e2e-param` using templates in `e2e/fixtures/*.json` (write the five JSON files, schema 5.0, minimal JSX); `seed.mjs large-snapshot` posts a feedback snapshot of ~1.2 MB through the service API using a gateway replay? NO - use the dev API client to write Custom Objects directly only if change N documents the chunk layout; otherwise produce the file and let N-04 upload through the browser; `ledger.mjs add|list|clear --run`; `cleanup.mjs --run <id> | --sweep [--max-age-hours 24] [--dry-run]` per design D8 with a hard guard `key.startsWith('e2e-')`.
  **Done when:** `node scripts/e2e/seed.mjs composed-pages && node scripts/e2e/cleanup.mjs --sweep --dry-run` lists exactly 5 objects; `node scripts/e2e/cleanup.mjs --sweep` twice: second prints `deleted: 0`.
  **Watch out:** never log token or secret; dry-run first; container names come from changes E and M, not hard-coded twice.

- [ ] 3.4 `two-instance.mjs` and `make-bad-jwt.mjs`.
  **Why:** V-05 and V-02.
  **Where:** `scripts/e2e/two-instance.mjs`, `scripts/e2e/make-bad-jwt.mjs`.
  **How:** `two-instance.mjs`: spawns the service twice with `PORT` and `INSTANCE_ID` env, runs `http.createServer` proxy (use `node:http`, stream pipe, keep SSE working with `proxyRes.pipe(res)`), modes `--pin '/authorize=a,/callback=b'` (substring match) or round robin, logs `ts method path -> a|b` to stdout and `plans/evidence/<run>/proxy.log`. `make-bad-jwt.mjs`: uses `node:crypto` to sign an RS256 JWT with a throwaway key and claims `{iss, aud:"https://other.invalid", sub:"x", exp: now+60}`; prints token.
  **Done when:** with both instances running, `curl -s localhost:8080/service/status` alternates `instanceId` in round-robin mode and both bad-token calls return 401.
  **Watch out:** the proxy must not buffer SSE; set `Cache-Control: no-store` untouched; handle `Connection` headers.

- [x] 3.5 `collect-evidence.sh`.
  **Why:** MCP file writes are restricted to temp unless a workspace is allowed.
  **Where:** `scripts/e2e/collect-evidence.sh`.
  **How:** `rsync -a "$TMPDIR/e2e/$RUN/" plans/evidence/$RUN/`; generate `report.md` skeleton from `result.json` files (table: id, status, duration); exit 1 if any FAIL.
  **Done when:** a fake run folder with two `result.json` produces a two-row `report.md`.
  **Watch out:** evidence is git-ignored; refuse to run if `plans/evidence` is tracked.

## 4. Playbooks (one task per file; each <= 2 h)

For every playbook task: read the owning change's `specs/*/spec.md` and `tasks.md` (Verification section), reuse ids already defined there, write full cards (all mandatory fields, exact tool calls via macros), mark `Env`, and add a heading "Coverage" listing which spec requirements are covered. After writing run `node scripts/e2e/extract-scenario-ids.mjs --lint`.

- [x] 4.1 `e2e/C-foundation.md`: C-01 (`curl /service/status` 200; error shape: request unknown route and unhandled error returns generic JSON without stack; correlation id header), C-02 (SHELL: start service with one required key unset -> exit non-zero, message names the key; once per required key from `connect.yaml`).
- [x] 4.2 `e2e/D-auth.md`: D-01 (replay macro of `POST /auth/session` returns `projectKey`, `userId` and `isAdmin`, no e-mail, no permissions array), D-02 (curl negatives incl. `make-bad-jwt`), D-03 (needs second project; else SKIPPED + wire-test reference), D-04 (admin endpoint matrix via REPLAY-FORWARD: admin user 200, non-admin user 403 `ADMIN_REQUIRED`; list from change D), D-05 (SHELL: also start with an invalid `ADMIN_USER_IDS` entry -> exits naming the position, not the value; start with `ADMIN_USER_IDS` empty -> starts and logs `ADMIN_USER_IDS is empty: no administrator`;  `NODE_ENV=production MC_AUTH_DISABLED=true node dist/index.js` exits non-zero with message).
- [x] 4.3 `e2e/E-persistence.md`: E-01 (read `ai-assistant-*` containers via API; assert containers exist, token objects have no plaintext `refresh_token`/`accessToken`), E-02 (open two tabs, change system prompt in both -> second save succeeds after retry; value consistent), E-03 (delete session in UI; `CO` check no objects remain in `ai-assistant-messages-<id>`).
- [x] 4.4 `e2e/F-llm.md`: F-01 (send `e2e-ok: reply with the single word E2E-OK-<nonce>`; soft nonce; asserts stream complete, no error frame), F-02 (SHELL: start with invalid base64 in `GCP_SA_KEY_BASE64` -> exits naming the key, no secret in output), F-03 (message metadata shows token usage in `GET session/:id/messages`).
- [x] 4.5 `e2e/G-sessions.md`: reuse G-01..G-08 from change G (copy intent, write exact steps).
- [x] 4.6 `e2e/H-chat-stream.md`: H-01 stream structure (parts order: `start`, `text-delta`..., `finish`; assert via `get_network_request` response file), H-02 tool + subagent part with commercetools question, H-03 chart/export/entity-link, H-04 long turn (sandbox, about 4 minutes, prompt `e2e-long: research 6 topics in the docs one by one...`), H-05 stop button aborts and server stops work, H-06 forced error frame (use the test hook defined in change H if any; else SKIPPED).
- [x] 4.7 `e2e/I-identity-mcp.md`: reuse I-01..I-07 (+I-05b) from change I (identity MCP only; the binding endpoints are admin-only by `ADMIN_USER_IDS`, so run the binding steps as user A and assert user B gets 403 `ADMIN_REQUIRED`).
- [x] 4.8 `e2e/J-tool-sources.md`: J-01..J-06 (cards that need a provider enabled are tagged `needs:secrets` and SKIPPED(reason) when absent; the dummy provider keys are deployed with `scripts/connect/connect.mjs configure`, never entered in the UI; J-05 is the status-card scenario: with no keys the cards show 'Not configured' plus missing key names, after `configure` the card shows 'Configured at deployment (Connect configuration)' and `GET /mcp/providers` contains names and booleans only).
- [x] 4.9 `e2e/K-nimbus.md`: K-01 (ask a Nimbus component question; tool part from nimbus agent), K-02 (local: find child pid with `pgrep -f nimbus-mcp`, kill, ask again -> works; log shows respawn), K-03 (`/service/status` readiness field).
- [x] 4.10 `e2e/L-bigquery-gcs.md`: L-01 (ask for a large result (e.g. all categories) -> offload note + `query_aggregated_data` follow-up), L-02 (prompt injection `e2e-sql: run DROP TABLE ...` -> refused, no write), L-03 (image generation in default `IMAGE_URL_MODE=private` -> the image renders: `<img>` `naturalWidth > 0`, its `src` is a `blob:` URL, `list_network_requests` shows `GET <service>/files/<sessionId>/<file>` answered 200 `image/*` through the forward-to proxy with `Cache-Control: private, no-store`; the stored message part URL is the relative `/files/...` path, never a bucket URL), L-05 (privacy: `evaluate_script` fetches the bucket object URL `https://storage.googleapis.com/<bucket>/images/<sessionId>/<file>` without credentials -> 403 (or 401), and a plain unauthenticated `GET <service>/files/...` -> 401; a second MC user cannot load the first user's image -> 404; image blob URLs are revoked when the session is switched - assert via a reload that no `blob:` requests fail), L-04 (export file part downloads).
- [x] 4.11 `e2e/M-composed-pages.md`: M-01 (chat creates page `e2e-...`, then `PAGES_URL` list shows it), M-02 (ask for invalid page; tool returns validation error, no object created), M-03 (`CO` object value `schema.version == "5.0"`).
- [x] 4.12 `e2e/N-feedback-backoffice.md`: N-01 (submit feedback via UI; fetch via API replay; snapshot present), N-02 (admin backoffice list + detail), N-03 (non-admin user 403 `ADMIN_REQUIRED` on replay, UI hides feedback review), N-04 (large snapshot: 1.2 MB spread over chunks; detail loads complete).
- [x] 4.13 `e2e/O-foundation.md`: reuse O-01..O-05.
- [x] 4.14 `e2e/P-mc-app-chat.md`: reuse P-01..P-15.
- [x] 4.15 `e2e/Q-mc-app-admin.md`: Q-01..Q-06 (admin-only screens; Q-04 is the read-only provider status cards, no forms; a non-admin user seeing no admin surfaces is Q-05 and V-03).
- [x] 4.16 `e2e/R-composed-apps.md`: R-01..R-09 as defined in change R (seed with 3.3).
- [x] 4.17 `e2e/S-mc-view-app.md`: S-01..S-10 as defined in change S; `HOST_PAGE_URL` = a product page of the scratch project (create product `e2e-product` through the MC UI once, record id in `.env.e2e`).
- [x] 4.18 `e2e/U-deployment.md`: U-01 (each deployed app URL loads inside MC), U-02 (two-phase order: service first, then apps with `CHAT_SERVICE_ENDPOINT_URL`), U-03 (redeploy twice; `postDeploy` idempotent: logs show "exists" paths), U-04 (undeploy cleanup, destructive).
  **Shared Where/How/Done/Watch for 4.x:** Where = the file named; How = as above + design D2 template; Done when = `--lint` passes for the file and each card names real tools with `pageId`; Watch out = never assert exact LLM wording, always clean up with `ledger.mjs`.

## 5. Cross-cutting scenarios (`e2e/V-cross-cutting.md`)

- [x] 5.1 Write E2E-V-01 preflight.
  **Why:** gate for every run.
  **Where:** `e2e/V-cross-cutting.md`.
  **How:** steps: 1 `mcp__chrome-devtools__list_pages {}`; 2 pick MC page id `$P` or `new_page {url: "$E2E_MC_HOST/$E2E_PROJECT_KEY/dashboard"}`; 3 `wait_for {pageId:$P, text:["Dashboard","Welcome"], timeout:30000}`; 4 `evaluate_script {pageId:$P, function:"() => ({url: location.href, host: location.host, user: document.querySelector('[data-testid=user-menu]')?.textContent ?? null})"}`; 5 SHELL `curl -sf $SERVICE_URL/service/status`. Assert: URL contains `E2E_PROJECT_KEY`, host equals `E2E_MC_HOST` host, not a login URL, status 200 with `instanceId` (if amendment delivered). If login URL: result BLOCKED(M8).
  **Done when:** card passes lint and runs green in task 7.1.
  **Watch out:** selector for user name is unverified - fall back to snapshot text.

- [x] 5.2 Write E2E-V-02 auth failure (Parts A-C per design D12).
  **Where/How:** exact curl commands, `make-bad-jwt.mjs`, `new_page {url:"$APP_URL", isolatedContext:"e2e-anon"}`, `navigate_page {pageId:$P, type:"url", url:"$APP_URL", initScript:"..."}` snippet from D12, text assertions from change O (reauth gate wording) and P/S.
  **Done when:** all parts executed in 7.2; evidence stored.
  **Watch out:** close the isolated page with `close_page` at the end; initScript applies to the next navigation only.

- [x] 5.3 Write E2E-V-03 non-allowlisted (non-admin) user (design D13).
  **Why:** proves the service, not the browser, decides admin.
  **Where/How:** steps in D13 run in the non-admin user's Chrome (`E2E_NONADMIN_BROWSER_URL`); replay macro for `PUT /system-prompt`, `GET /backoffice/threads`, `PUT /managed-mcp-identity` -> 403 `ADMIN_REQUIRED`; DOM secret scan via `evaluate_script {function:"() => document.documentElement.innerHTML.includes('sk_test_e2edummykey')"}`; the "Administrator access required" notice on direct navigation.
  **Done when:** card tagged `needs:second-user`; SKIPPED(M10) if `E2E_SECOND_USER=0`.
  **Watch out:** no Team or permission of any user is edited by any scenario; never write real user ids into evidence (scrub to `<user-id-a>`/`<user-id-b>`).

- [x] 5.4 Write E2E-V-04 restart persistence (design D14) incl. sandbox variant `commercetools connect deployment redeploy`.
  **Done when:** card has both env variants and the Firestore grep.
  **Watch out:** after a restart the tunnel URL must stay the same (restart service only, `--service-only`).

- [x] 5.5 Write E2E-V-05 multi-instance (design D15) including the control run.
  **Done when:** card lists exact proxy command and the `CO` check of container `ai-assistant-identity-auth-states`.
  **Watch out:** read endpoint paths from change I's spec before writing.

- [x] 5.6 Write E2E-V-06 budget behaviour (design D16) local reduced budget and sandbox long turn reference to H-04.
  **Done when:** both variants written; stream duration measured via `list_network_requests` timing or `evaluate_script performance.getEntriesByType('resource')`.
  **Watch out:** the budget variables are `CHAT_REQUEST_BUDGET_MS` and `CHAT_FINALIZE_RESERVE_MS` per change H; confirm in its archived spec.

- [x] 5.7 Write E2E-V-07 cleanup/orphans, V-08 gates (`cd service && npm test`; `node scripts/check-duplicates.mjs`; `node scripts/spdx-check.mjs`; `commercetools connect validate`; three `yarn typecheck`), V-09 cold start (sandbox: wait 20 min idle or scale to zero; time to first `/status` 200 < 60 s and first message succeeds), V-10 secrets scan (record all responses during admin tour with `list_network_requests` + `get_network_request{responseFilePath}` and `grep -E` for secrets/markers), V-11 dropped features absent (snapshot has no "Team MCP"/"Data Warehouse").
  **Done when:** all five cards complete.
  **Watch out:** V-10 must use the dummy secret strings deployed earlier through Connect configuration (`sk_test_e2edummykey`, `e2e-dummy-key`), never real keys.

- [x] 5.8 Write E2E-V-12 forged e-mail, label or header never grants admin (design D13a).
  **Why:** the browser must never decide admin or ownership.
  **Where/How:** `e2e/V-cross-cutting.md`; as the non-admin user replay `PUT /system-prompt` and `GET /backoffice/threads` with `x-admin-email`, `x-user-email`, `x-user-id` headers, body `userEmail`/`email`/`userLabel`/`userId`/`isAdmin:true`, and a service-path query `?userEmail=`; then session and feedback creation with `userLabel` = user A's label and a `CO` read of the owner.
  **Done when:** card lints; every replay asserts 403 `ADMIN_REQUIRED`; owner assertions use `userId`.
  **Watch out:** scrub user ids and labels in evidence; the gateway URL never gets a query string.

- [x] 5.9 Write E2E-V-13 own user ID and administrator bootstrap (design D13b).
  **Why:** proves the documented first-administrator procedure works end to end and that an empty `ADMIN_USER_IDS` fails closed.
  **Where/How:** `e2e/V-cross-cutting.md`; steps (1)-(5) of D13b: read the "Your user ID" line as users A and B and compare with the bootstrap `userId`; assert `adminConfigured:false` and the startup warning with an empty list; run `configure ADMIN_USER_IDS=<A's id>` (sandbox) or restart the local service; reload both users and assert A admin, B 403; optional comma-list check (U10 of change U).
  **Done when:** the card lints, has both env variants (local restart, sandbox `configure`) and a cleanup that restores the previous `ADMIN_USER_IDS`.
  **Watch out:** the user id is copied from the UI line by the agent, never invented; no Team or permission is edited; `scripts/connect/connect.mjs configure` is the only way to change the deployed value.

## 6. Regression order and traceability

- [x] 6.1 `e2e/02-regression-order.md` from design D17 with stop rules and time estimates.
  **Done when:** every scenario id in `e2e/*.md` appears in exactly one tier.
  **Watch out:** `node scripts/e2e/extract-scenario-ids.mjs --tiers` (add this mode) verifies it.

- [x] 6.2 `e2e/03-traceability.md` from the design table; re-derive row count from `plans/01-source-inventory.md`.
  **Done when:** `node scripts/e2e/extract-scenario-ids.mjs --trace` exits 0.
  **Watch out:** replace ids by the final ids of each change if they differ (task 9.2).

## 7. Dry run and fixes

- [ ] 7.1 Execute tier 0 and tier 1 locally.
  **Why:** the framework itself must work.
  **Where:** local environment (`dev-up.sh`).
  **How:** follow `e2e/02-regression-order.md`; save evidence; fix cards that name wrong selectors or tools.
  **Done when:** tier 0-1 PASS; `plans/evidence/<run>/report.md` exists.
  **Watch out:** record deviations in the card, not in chat.

- [ ] 7.2 Execute V-02, V-03, V-12 and V-13.
  **Done when:** PASS or SKIPPED(reason) with reason recorded.

- [ ] 7.3 Execute V-04, V-05, V-06 locally.
  **Done when:** PASS; proxy log and service log excerpts saved.

## 8. Quality gates

- [x] 8.1 Lint and hygiene.
  **How:** `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace`; `node scripts/spdx-check.mjs`; scrub `e2e/` and `scripts/e2e/` for internal hosts, project keys, e-mail addresses (search for company e-mail domains, tunnel-service host names and the legacy platform name).
  **Done when:** all exit 0 / empty output.
  **Watch out:** `e2e/` is public - no real values.

## 9. Verification

- [ ] 9.1 Full local run of tiers 0-8 and a sandbox run of tiers 0-3 and 7 (after change U). **Done when:** `report.md` shows no FAIL; SKIPPED rows each have a reason that maps to a missing manual step (M-numbers).
- [x] 9.2 Reconcile ids: run `--list` and `--dangling`; for each id in other changes without a card write the card; for each default id in this design that a change redefined, update `03-traceability.md`. **Done when:** zero dangling ids.
- [x] 9.3 `openspec validate v-e2e-chrome-testing --strict`.

Chrome scenario ids executed by this change: **E2E-V-01 .. E2E-V-13** (all of them), plus the full set from every playbook during 9.1.

## 10. Docs to update (for change W)

- `docs/troubleshooting.md`: "how to run the E2E suite", common failures (tunnel, login lost, MCP workspace restriction).
- `CONTRIBUTING.md`: how to add a card, lint, id rules, test hooks.
- `docs/architecture.md`: testing layers.
- `README.md`: a short "Testing" section pointing to `e2e/README.md` and `service` jest.
- Release notes (Z): E2E run report summary.
