## ADDED Requirements

### Requirement: Scenario format and identifiers
Every end-to-end scenario SHALL be written in a playbook under `e2e/` as a scenario card with: id `E2E-<SPEC>-<nn>[letter]` (SPEC is the owning change letter, `V` for cross-cutting), title, owning spec and requirement, tags, environment (`local`, `sandbox` or `both`), time budget in seconds, preconditions and needed manual steps, numbered steps each naming one exact `mcp__chrome-devtools__*` tool with its parameters (or a `SHELL` command), numbered assertions each tagged with an oracle (`DOM`, `NET`, `CONSOLE`, `SHELL`, `CO` for Custom Object), cleanup, and evidence file names.

#### Scenario: Card completeness lint
- **WHEN** `node scripts/e2e/extract-scenario-ids.mjs --lint` runs over `e2e/*.md`
- **THEN** every card has all mandatory fields, ids are unique and every id matches the pattern

#### Scenario: Exact tool names
- **WHEN** a step names a tool
- **THEN** the name exists in the connected Chrome DevTools MCP tool list and every required parameter (notably `pageId`) is given

### Requirement: One playbook per feature spec
The repository SHALL contain one playbook file per feature spec (C through U that have user-visible or API-observable behaviour, plus `V-cross-cutting.md`), and every Chrome-scenario id mentioned in any change's `tasks.md` SHALL exist as a card in the matching playbook.

#### Scenario: No dangling ids
- **WHEN** the id extractor compares ids found in `openspec/changes/*/tasks.md` (and archived specs) with cards in `e2e/`
- **THEN** it reports zero ids without a card

### Requirement: Attaching to a logged-in browser
The framework SHALL document and verify how the Chrome DevTools MCP is attached to a dedicated Chrome profile in which the tester has logged in to Merchant Center once per test user (admin user and non-admin user, manual steps M8 and M10), and every run SHALL begin with the preflight scenario `E2E-V-01` that proves the attachment, the Merchant Center host and region, the project key and the logged-in user.

#### Scenario: Preflight passes
- **WHEN** `E2E-V-01` runs
- **THEN** `list_pages` returns at least one page, the Merchant Center project dashboard of the scratch project is reachable without a login redirect, and the run records the user name and project key in `report.md`

#### Scenario: Not logged in
- **WHEN** the project URL redirects to a login page
- **THEN** the run stops with status BLOCKED(M8) and does not attempt feature scenarios

### Requirement: Local and deployed environments
Playbooks SHALL run unchanged against (a) local development (`mc-scripts start` for the apps, the service started locally and exposed to the Merchant Center gateway through a tunnel) and (b) the Connect sandbox deployment, selected by variables in `e2e/.env.e2e` (git-ignored) and documented in `e2e/README.md`; each card declares which environments it supports and why.

#### Scenario: Environment switch
- **WHEN** only `E2E_ENV` and the three base URLs change in `e2e/.env.e2e`
- **THEN** the same smoke scenarios pass in both environments

### Requirement: Evidence capture
Each executed scenario SHALL write evidence under `plans/evidence/<run-id>/<scenario-id>/` (accessibility snapshot text, at least one screenshot, network request summary as JSON, console messages as text, `result.json` with PASS, FAIL, SKIPPED(reason) or BLOCKED(reason)), and the run SHALL produce `report.md` with one row per scenario.

#### Scenario: Evidence tree
- **WHEN** a run finishes
- **THEN** each executed scenario folder holds `result.json` and at least `snapshot-final.txt` and `screenshot-final.png`, and `report.md` lists every scenario with its status

#### Scenario: Write location
- **WHEN** a tool writes a file outside the MCP server's allowed directory
- **THEN** the playbook's collect step copies it from the OS temp directory into the evidence tree (default restriction of the MCP server)

### Requirement: Fixtures and cleanup
Test data SHALL be prefixed `e2e-`, created through the application path or `scripts/e2e/seed.mjs`, recorded in a ledger file, and removed by `scripts/e2e/cleanup.mjs` which is idempotent, deletes only ledger entries or objects whose key or title starts with `e2e-`, and never touches other data.

#### Scenario: Idempotent cleanup
- **WHEN** `node scripts/e2e/cleanup.mjs --run <run-id>` is run twice
- **THEN** the second run reports zero deletions and exits 0

#### Scenario: Orphan sweep
- **WHEN** a previous run crashed before cleanup and `cleanup.mjs --sweep` runs
- **THEN** all `e2e-` objects older than the configured age are removed from every `ai-assistant-*` container and from `shared-composed-pages`

### Requirement: Rules for non-deterministic LLM output
Scenarios SHALL assert structure and protocol (stream completes, expected part types appear, no error frame, HTTP statuses, persisted objects, zero error-level console messages from application code) and SHALL NOT assert exact model wording; any content check SHALL use a nonce the prompt asks the model to echo and SHALL be a soft assertion that triggers at most one retry in a new session.

#### Scenario: Soft assertion retry
- **WHEN** a nonce-echo assertion fails once
- **THEN** the scenario is repeated once in a new session and recorded as FLAKE-PASS if it then passes, otherwise FAIL

#### Scenario: Hard assertions never retried
- **WHEN** a network status, console-error or authorization assertion fails
- **THEN** the scenario fails without retry

### Requirement: Authentication failure scenario
`E2E-V-02` SHALL prove that calls without a valid Merchant Center gateway token are rejected and that an expired Merchant Center session produces a visible, recoverable state in each frontend.

#### Scenario: Service rejects unauthenticated calls
- **WHEN** the service is called directly with no token, with a malformed bearer token and with a token for another audience
- **THEN** each response is 401, the body contains no stack trace or secret, and `/service/status` still answers 200

#### Scenario: Not logged in to Merchant Center
- **WHEN** an app URL is opened in an isolated browser context with no cookies
- **THEN** the Merchant Center login page is shown and no request to the service succeeds

#### Scenario: Expired session surfaces in the UI
- **WHEN** the gateway call is made to return 401 through an init script
- **THEN** `mc-app` shows the "session has expired" state with "Sign in again" and Retry, and `mc-view-app` shows an error with Retry

### Requirement: Non-allowlisted user scenario
`E2E-V-03` SHALL prove that a Merchant Center user whose user id is not in `ADMIN_USER_IDS` (the non-admin user) cannot use admin functions in the UI or through the API, and that no Merchant Center permission is edited during the run.

#### Scenario: Non-admin UI
- **WHEN** the non-admin user opens `mc-app`
- **THEN** the bootstrap reports `isAdmin: false`, no admin navigation item or page (settings write, system prompt, tool-call-log mode, backoffice, feedback review, Managed MCP setup) is shown, the MCP Providers section shows read-only status cards, no secret value is in the DOM, and direct navigation to an admin route shows the "Administrator access required" notice

#### Scenario: Non-admin API
- **WHEN** a gateway request that replays a legitimate forwarded call is sent with method PUT to the system-prompt endpoint as the non-admin user
- **THEN** the service answers 403 with code `ADMIN_REQUIRED` and the stored prompt is unchanged

### Requirement: Forged e-mail, label or header never grants admin
`E2E-V-12` SHALL prove that an e-mail address, label or identity hint supplied by the browser (header, request body, query string, `userEmail`, `userLabel`) is never used for authorization, keys, filters or ownership, and that only the user id in `ADMIN_USER_IDS` makes a user an administrator.

#### Scenario: Forged e-mail header, body and query
- **WHEN** the non-admin user replays an admin route with a header `x-admin-email`, a body field `userEmail` and `userLabel`, a query `?userEmail=` and a header or body field `isAdmin: true`, `userId` set to the admin user's id
- **THEN** every call answers 403 `ADMIN_REQUIRED`

#### Scenario: Forged label does not change ownership
- **WHEN** the non-admin user creates a session and submits feedback with `userLabel` equal to the admin user's label
- **THEN** the stored owner is the non-admin user's `userId`, the admin user's session list does not contain the session, and the backoffice shows the label as unverified text without a link

### Requirement: Own user ID and administrator bootstrap
`E2E-V-13` SHALL prove that every user can read their own Merchant Center user id in the app, and that an administrator is created only by putting that id into `ADMIN_USER_IDS` through a `configure` redeploy (local runs: the service environment and a restart); with an empty list nobody is an administrator.

#### Scenario: Both users see their own ID
- **WHEN** users A and B open `mc-app` Settings > About (and the panel footer of `mc-view-app`)
- **THEN** each sees a read-only "Your user ID" line whose value equals `userId` of their own `POST /auth/session` response, and the two values differ

#### Scenario: Empty list means nobody is an administrator
- **WHEN** the service runs with `ADMIN_USER_IDS` empty or unset
- **THEN** `isAdmin` is false for both users, admin routes answer 403 `ADMIN_REQUIRED`, `GET /service/status` shows `adminConfigured: false` and the start log contains `ADMIN_USER_IDS is empty: no administrator`

#### Scenario: Administrator appears after configure and refresh
- **WHEN** user A's id (copied from the "Your user ID" line) is set with `configure ADMIN_USER_IDS=<id of A>` (sandbox) or by restarting the local service, and both users refresh the app
- **THEN** user A has `isAdmin: true` and the admin surfaces and an admin route replay answers 200, while user B stays `isAdmin: false` and gets 403 `ADMIN_REQUIRED`

### Requirement: Persistence across service restart
`E2E-V-04` SHALL prove that sessions, messages, settings and identity connections survive a restart or redeploy of the service, demonstrating that no in-process state and no external database other than Custom Objects is needed.

#### Scenario: Restart local service
- **WHEN** a chat with a nonce message exists, the service process is killed and started again, and the page is reloaded
- **THEN** the session list contains the session, the transcript shows the nonce message, the system prompt is unchanged and the identity connection still reports connected

#### Scenario: No Firestore
- **WHEN** the service source and configuration are searched for Firestore usage
- **THEN** none is found

### Requirement: Multi-instance safety
`E2E-V-05` SHALL prove that the identity OAuth flow completes when the authorize request and the callback are served by different service instances.

#### Scenario: Start on one instance, callback on another
- **WHEN** two service instances run behind a path-pinned proxy (authorize to instance A, callback to instance B) and the user connects their account
- **THEN** the connection succeeds, the proxy log shows different instance ids and the single-use state object is deleted

#### Scenario: Replay rejected
- **WHEN** the callback URL is requested a second time
- **THEN** the service answers with an "already used or expired" error and no second token exchange is made

### Requirement: Five-minute budget behaviour
`E2E-V-06` SHALL prove that a chat turn which would exceed the configured stream budget ends gracefully with a visible, persisted final message instead of a broken stream, in a local run with a reduced budget, and that a deployed run survives a turn of about four minutes.

#### Scenario: Reduced budget locally
- **WHEN** the service runs with a budget of 20 seconds and a prompt requests a long multi-tool task
- **THEN** the stream closes by 25 seconds with a finish indication, the UI shows the graceful-finish notice, the transcript is persisted and the next message in the same session works

#### Scenario: Sandbox long turn
- **WHEN** a prompt that takes about four minutes is sent to the sandbox deployment
- **THEN** the stream completes without a proxy or gateway cut and the final message is persisted

### Requirement: Cross-cutting safety scenarios
`E2E-V-09`, `E2E-V-10` and `E2E-V-11` SHALL prove cold-start behaviour after scale-to-zero, that no secret value ever appears in a browser-visible response, and that features dropped from the product (team MCP, data-warehouse toggle) are absent.

#### Scenario: Secrets scan
- **WHEN** all responses recorded during a full admin session are scanned for the test secrets and for PEM or base64 service-account markers
- **THEN** none is found

#### Scenario: Dropped features absent
- **WHEN** the UI is inspected for "Team MCP" and "Data Warehouse"
- **THEN** the UI items are absent

### Requirement: Traceability
`e2e/03-traceability.md` SHALL map every KEEP and CHANGE row of `plans/01-source-inventory.md` to at least one existing scenario id, and `extract-scenario-ids.mjs --trace` SHALL fail when a row has no id or an id does not exist.

#### Scenario: Trace lint
- **WHEN** `node scripts/e2e/extract-scenario-ids.mjs --trace` runs
- **THEN** it exits 0 and prints the number of mapped features equal to the number of KEEP/CHANGE rows

### Requirement: Regression order and report
The framework SHALL define a regression suite order (preflight, smoke, persistence, features, identity and admin, apps, negative and security, destructive and slow, cleanup) and a stop rule, and SHALL produce a final `report.md` with totals and a link to evidence per scenario.

#### Scenario: Stop on blocked preflight
- **WHEN** tier 0 fails
- **THEN** no later tier is executed and the report says BLOCKED with the reason

### Requirement: Safety of the test run
Runs SHALL target only the scratch project named in `e2e/.env.e2e`, SHALL abort if the project key matches a denylist or the region/host is not the configured one, SHALL use dummy values for third-party credentials (set as Connect configuration of the scratch deployment, for example `STRIPE_SECRET_KEY=sk_test_e2edummykey`; never typed into the UI, which has no credential forms), and SHALL never print or save secret values in evidence.

#### Scenario: Wrong project
- **WHEN** the Merchant Center project key in the page URL differs from `E2E_PROJECT_KEY`
- **THEN** the run aborts before any write
