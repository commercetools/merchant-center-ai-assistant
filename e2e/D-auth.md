# Playbook D: Merchant Center session authentication and admin gating

Owning change: `d-mc-session-auth`. D defined `E2E-D-01` to `E2E-D-03` in its own `tasks.md` (7.2);
those ids and meanings win. The verifier negatives, the admin endpoint matrix and the startup guards
that the V design had reserved under other D numbers are `E2E-D-04` to `E2E-D-06` here.

The administrator is decided by the service only: the verified Merchant Center user id from the
gateway token must be in `ADMIN_USER_IDS`. Admin routes answer 403 with code `ADMIN_REQUIRED`.

### E2E-D-01 - Bootstrap payload and administrator bootstrap
- Spec: d-mc-session-auth / bootstrap, admin decision (tasks 7.2)
- Tags: smoke, regression, needs:M8, needs:deployment
- Env: both
- Budget: 300
- Pre: `E2E-V-01` passed; the app is open as user A (`$P`); `ADMIN_USER_IDS` is empty for the first part (a fresh deployment, or the local `.env.local` without the key). The second part is `E2E-V-13` (the `configure` redeploy) and is not repeated here.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of POST with x-forward-to ending /service/auth/session>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-D-01/bootstrap.json"}
  4. MACRO REPLAY-FORWARD POST /auth/session null null
  5. SHELL: `curl -s "$SERVICE_URL/service/status"`
- Assert:
  A1 [NET] the bootstrap answers 200 and `data` has `projectKey` equal to `$E2E_PROJECT_KEY`, a non-empty `userId`, boolean `isAdmin`, boolean `identityMcpConfigured`, optional `identityUserConnected`.
  A2 [NET] the response has no `permissions` array, no e-mail address and no name of the user.
  A3 [NET] with `ADMIN_USER_IDS` empty `isAdmin` is `false` for user A and `adminConfigured` in the status body is `false`.
  A4 [NET] the replay (step 4) returns the same `userId` as the page's own call.
  A5 [CONSOLE] no error-level message from app code.
- Cleanup: none.
- Evidence: bootstrap.json (user id replaced by `<user-id-a>`), snapshot-final.txt, console.txt
- Status: NOT RUN

### E2E-D-02 - Non-admin stays non-admin, forged hints change nothing
- Spec: d-mc-session-auth / admin decision, never trust client identity (tasks 7.2)
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 240
- Pre: user B is attached on `chrome-devtools-b`; `ADMIN_USER_IDS` contains user A's id only (after `E2E-V-13` or a configured deployment).
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD POST /auth/session {"userEmail":"admin@example.invalid","userLabel":"e2e-forged","isAdmin":true,"userId":"<user-id-a>"} {"x-admin-email":"admin@example.invalid","x-user-id":"<user-id-a>"}
  3. MACRO REPLAY-FORWARD POST /auth/session?userEmail=admin@example.invalid null null
- Assert:
  A1 [NET] user B's own bootstrap has `isAdmin: false`.
  A2 [NET] both replays answer 200 with `isAdmin: false` and `userId` equal to user B's id (not the forged one).
  A3 [NET] no response contains the forged address or label.
- Cleanup: none.
- Evidence: replay-results.json (ids scrubbed), network.json
- Status: NOT RUN

### E2E-D-03 - Project mismatch (wire test only)
- Spec: d-mc-session-auth / project guard
- Tags: regression, negative, shell
- Env: local
- Budget: 120
- Pre: the browser cannot produce a token for another project from the scratch project's Merchant Center, so this case is covered by the service's wire tests only; a second commercetools project is not part of the test setup. When a run records it, the result is SKIPPED(no second project) with the jest output attached.
- Steps:
  1. SHELL: `cd service && NODE_OPTIONS=--experimental-vm-modules npx jest tests/wire/mc-session-auth.spec.ts`
- Assert:
  A1 [SHELL] the suite passes and contains the project mismatch cases (403 for a token whose project key differs from `CTP_PROJECT_KEY`).
- Cleanup: none.
- Evidence: jest-output.txt
- Status: NOT RUN

### E2E-D-04 - Verifier negatives: no token, bad token, wrong audience
- Spec: d-mc-session-auth / session verification matrix
- Tags: smoke, negative, shell
- Env: both
- Budget: 120
- Pre: `scripts/e2e/make-bad-jwt.mjs` is available; the service is reachable.
- Steps:
  1. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session"`
  2. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session" -H "Authorization: Bearer abc.def.ghi"`
  3. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session" -H "Authorization: Bearer $(node scripts/e2e/make-bad-jwt.mjs)"`
  4. SHELL: `curl -si -X POST "$SERVICE_URL/service/auth/session" -H "Authorization: $(node scripts/e2e/make-bad-jwt.mjs)"`
  5. SHELL: `curl -si "$SERVICE_URL/service/status"`
- Assert:
  A1 [SHELL] steps 1 to 4 each answer 401 (a raw token without `Bearer` is rejected too).
  A2 [SHELL] no body contains a stack trace (`at ` lines, `Error:`), a token, a key id or the expected audience value.
  A3 [SHELL] step 5 still answers 200.
- Cleanup: none.
- Evidence: negatives.txt
- Status: NOT RUN

### E2E-D-05 - Admin endpoint matrix
- Spec: d-mc-session-auth / requireAdmin on admin routes
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 480
- Pre: user A on `chrome-devtools` (admin), user B on `chrome-devtools-b`; `ADMIN_USER_IDS` has A only; The stored system prompt is read first and restored in Cleanup.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD GET /system-prompt null null
  3. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-d05"} null
  4. MACRO REPLAY-FORWARD PUT /tool-call-logs {"mode":"all"} null
  5. MACRO REPLAY-FORWARD POST /backoffice/threads {} null
  6. MACRO REPLAY-FORWARD GET /feedback/fetch null null
  7. MACRO REPLAY-FORWARD DELETE /managed-mcp-identity null null
  8. MACRO REPLAY-FORWARD GET /backoffice/is-admin null null
  9. MACRO REPLAY-FORWARD GET /session/all null null
- Assert:
  A1 [NET] as user B (run the steps on `chrome-devtools-b`): steps 3, 4, 5, 6 and 7 answer 403 with `code: "ADMIN_REQUIRED"`; step 2, 8 and 9 answer 200 (`is-admin` reports false for B); the stored prompt is unchanged (read as A).
  A2 [NET] as user A (repeat on `chrome-devtools`): steps 3 and 4 answer 200, steps 5 and 6 answer 200, `is-admin` reports true; step 7 is NOT sent for A in this card (it would unbind the project; `E2E-I-07` owns it), expect it skipped.
  A3 [CONSOLE] no error-level message from app code.
- Cleanup: as user A restore the original system prompt and tool-call-log mode (values read at the start).
- Evidence: matrix.json (status and code per route and user, ids scrubbed)
- Status: NOT RUN

### E2E-D-06 - Startup guards: dev bypass and admin list
- Spec: d-mc-session-auth / MC_AUTH_DISABLED guard, ADMIN_USER_IDS parsing
- Tags: regression, negative, shell
- Env: local
- Budget: 240
- Pre: `cd service && npm run build`; port 8081 free; a valid base environment from `.env.local` (not printed).
- Steps:
  1. SHELL: `NODE_ENV=production MC_AUTH_DISABLED=true PORT=8081 node --env-file=.env.local build/index.js; echo "exit=$?"`
  2. SHELL: `ADMIN_USER_IDS="ok-id,bad id" PORT=8081 node --env-file=.env.local build/index.js; echo "exit=$?"`
  3. SHELL: `ADMIN_USER_IDS="" PORT=8081 node --env-file=.env.local build/index.js` (stop after 10 s) then `curl -s localhost:8081/service/status`
- Assert:
  A1 [SHELL] step 1 exits non-zero with a message that the bypass is refused in production; nothing listens on 8081.
  A2 [SHELL] step 2 exits non-zero naming the position of the invalid entry (second entry), not its value.
  A3 [SHELL] step 3 starts, logs `ADMIN_USER_IDS is empty: no administrator`, and `/service/status` shows `adminConfigured: false`.
  A4 [SHELL] with `MC_AUTH_DISABLED=true` outside production the log carries one warning and requests with header `x-dev-user-id` are accepted (development convenience only; never run against a deployment).
- Cleanup: kill processes on 8081.
- Evidence: guards.txt
- Status: NOT RUN

## Coverage

- Session verification (JWKS, audience, project guard): `E2E-D-03`, `E2E-D-04`; bootstrap payload: `E2E-D-01`; admin decision: `E2E-D-01`, `E2E-D-02`, `E2E-D-05`; dev bypass guard and admin list parsing: `E2E-D-06`. `E2E-V-02`, `E2E-V-03`, `E2E-V-12`, `E2E-V-13` add the browser-level cases.
- Not covered by a browser card: the JWKS cache and clock skew behaviour (wire tests only).
