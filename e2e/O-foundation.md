# Playbook O: frontend foundation

Owning change: `o-frontend-foundation` (ids `E2E-O-01` to `E2E-O-06` are defined in its `tasks.md`
section 11). All browser traffic to the service is `POST|GET <mcApiUrl>/proxy/forward-to` with the
target in `x-forward-to`, `x-forward-to-audience-policy: forward-url-full-path` and relayed
`x-forward-header-*`; the gateway URL never has a query string (CORS preflight).

The foundation stubs said "AI Assistant foundation ready"; `mc-app` now shows the real chat surface
(changes P and Q), so the ready text of `mc-app` is the composer placeholder `Ask about products,
orders, pricing or promotions…` (or `Administrator access required` when the project has no binding
and the user is not an administrator). `composed-apps` shows "AI Assistant Pages foundation ready"
until change R merges (then the list of pages, see `R-composed-apps.md`). `mc-view-app` shows the panel
on a host page.

### E2E-O-01 - Bootstrap works
- Spec: o-frontend-foundation / session bootstrap
- Tags: smoke, needs:M8, needs:deployment
- Env: both
- Budget: 120
- Pre: `E2E-V-01` passed; the service is reachable from the gateway (tunnel or sandbox) and `MC_AUTH_DISABLED` is not set.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of POST .../proxy/forward-to with x-forward-to ending /service/auth/session>, requestFilePath: "$TMPDIR/e2e/$RUN/E2E-O-01/bootstrap-request.json", responseFilePath: "$TMPDIR/e2e/$RUN/E2E-O-01/bootstrap-response.json"}
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] one `POST .../proxy/forward-to` for the bootstrap answered 200.
  A2 [NET] the response `data` has `projectKey`, `userId`, boolean `isAdmin`, boolean `identityMcpConfigured`; optional `identityUserConnected` and `toolCallLogs` are recorded when present; there is no `permissions` field and no e-mail.
  A3 [DOM] the app shows its ready text (see above), no error banner.
- Cleanup: none.
- Evidence: bootstrap-response.json (ids scrubbed), snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-O-02 - Request shape of the gateway call
- Spec: o-frontend-foundation / forward-to contract
- Tags: smoke, regression, needs:M8
- Env: both
- Budget: 120
- Pre: `E2E-O-01` ran in the same page load.
- Steps:
  1. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <bootstrap reqid>}
  2. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage)})"}
  3. SHELL: `node scripts/check-duplicates.mjs`
- Assert:
  A1 [NET] the request URL path is exactly `/proxy/forward-to` with no `?`.
  A2 [NET] the request headers contain `x-forward-to` ending in `/service/auth/session` and `x-forward-to-audience-policy: forward-url-full-path`; no `authorization` header other than the gateway's own (the header value is redacted by the MCP).
  A3 [DOM] the storage keys contain no token, no service credential and no e-mail (names only are listed).
  A4 [SHELL] the drift check passes for the three `forward-to.ts` copies.
- Cleanup: none.
- Evidence: request-headers.json (names and non-secret values), storage-keys.json
- Status: NOT RUN

### E2E-O-03 - The administrator flag follows the user id, not the browser
- Spec: o-frontend-foundation / `isAdmin` gating
- Tags: smoke, regression, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: user A (id in `ADMIN_USER_IDS`) and user B (not in it) attached on their own Chrome servers.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <bootstrap reqid>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-O-03/bootstrap-<user>.json"}
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => { localStorage.setItem('userEmail', 'admin@example.invalid'); localStorage.setItem('x-admin-email', 'admin@example.invalid'); return Object.keys(localStorage); }"}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  6. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [NET] user A: `isAdmin` is `true`; user B: `false`; neither response contains an e-mail or `permissions`; each contains the caller's own `userId`.
  A2 [NET] after planting the forged localStorage entries as user B, the bootstrap still answers `isAdmin: false`.
  A3 [DOM] user B sees no admin navigation (see `E2E-Q-09`).
- Cleanup: remove the planted keys (`evaluate_script` with `localStorage.removeItem`).
- Evidence: bootstrap-a.json, bootstrap-b.json (ids scrubbed)
- Status: NOT RUN

### E2E-O-04 - No content security policy errors
- Spec: o-frontend-foundation / CSP of the three apps
- Tags: smoke, needs:M8
- Env: both
- Budget: 180
- Pre: none.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  3. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
  4. MACRO OPEN-APP $PAGES_URL
  5. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
  6. MACRO OPEN-APP $VIEW_URL
  7. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
- Assert:
  A1 [CONSOLE] no message contains `Content Security Policy` for any of the three apps.
  A2 [CONSOLE] no error-level message from app code (third-party noise is listed in the evidence, not ignored silently).
  A3 [DOM] each app shows its ready state; `mc-view-app` shows the panel on its host page.
- Cleanup: none.
- Evidence: console-mc-app.txt, console-composed-apps.txt, console-mc-view-app.txt
- Status: NOT RUN

### E2E-O-05 - Reauthentication and retry gate
- Spec: o-frontend-foundation / bootstrap error gates
- Tags: regression, negative, destructive, needs:M8
- Env: local (the app must be restarted with a bad endpoint); the 401 variant is `E2E-V-02` part C
- Budget: 300
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; stop `mc-scripts start` and restart it with `CHAT_SERVICE_ENDPOINT_URL=https://example.invalid/service`.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload", timeout: 60000}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Retry", "unavailable"], timeout: 60000}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-O-05/snapshot-error.txt"}
  4. SHELL: restart the app with the correct `CHAT_SERVICE_ENDPOINT_URL`
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload", timeout: 60000}
  6. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…"], timeout: 60000}
- Assert:
  A1 [DOM] a dialog with "Retry" as the primary action appears (non-401 error) and the page behind it says the service is unavailable.
  A2 [DOM] after restoring the endpoint and reloading, the app shows its ready state.
  A3 [CONSOLE] no uncaught exception (the failed fetch is handled).
- Cleanup: restore `.env` values (never commit them).
- Evidence: snapshot-error.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-O-06 - Own user id is exposed and differs per user
- Spec: o-frontend-foundation / bootstrap `userId`
- Tags: regression, needs:M8, needs:second-user
- Env: both
- Budget: 180
- Pre: users A and B attached.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <bootstrap reqid>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-O-06/bootstrap-<user>.json"}
- Assert:
  A1 [NET] `data.userId` is a non-empty string for each user, different for A and B, and equals the id the owner lists for each user in manual step M10 (compared by the agent, never printed).
  A2 [DOM] the visible "Your user ID" line is verified in `E2E-P-16`, `E2E-S-12` and `E2E-V-13`.
- Cleanup: none.
- Evidence: bootstrap-a.json, bootstrap-b.json (ids replaced by `<user-id-a>`, `<user-id-b>`)
- Status: NOT RUN

## Coverage

- Bootstrap and request contract: `E2E-O-01`, `E2E-O-02`, `E2E-O-06`; admin flag: `E2E-O-03`; CSP and i18n wiring (no console errors): `E2E-O-04`; error gate: `E2E-O-05`.
- Not covered: the Nimbus typegen scripts and version checks (`cd mc-app && yarn check:nimbus-surface`, `node scripts/check-versions.mjs`, run by `E2E-V-08`).
