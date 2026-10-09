# Playbook I: identity-mode Managed MCP

Owning change: `i-identity-managed-mcp` (ids `E2E-I-01` to `E2E-I-07` and `E2E-I-05b` are defined in
its `tasks.md`; the sign-in card `E2E-I-00` of an earlier draft was removed by an owner decision).
Routes (service, mounted at `/service/managed-mcp-identity`): `GET /` binding (404
`IDENTITY_MCP_NOT_CONFIGURED` when unbound), `PUT /` and `DELETE /` (administrator only, body
`{serverKey}`), `GET /status`, `POST /authorize` (returns `authorizationUrl`), `GET /callback`
(unauthenticated, single-use `state`, HTML page that posts a message to the opener and closes),
`POST /verify`, `DELETE /me`. Tokens are stored encrypted in `ai-assistant-identity-tokens`, the
PKCE attempt in `ai-assistant-identity-auth-states`.

The binding steps need an identity-mode Managed MCP server in the scratch project (manual step M11).
The bind-time check may be impossible with template metadata (open question in change I); if `PUT`
cannot succeed the cards record BLOCKED(M11) with the response body.

### E2E-I-01 - Fresh deployment: not configured, the app shows the setup step
- Spec: i-identity-managed-mcp / binding read
- Tags: smoke, needs:M8
- Env: both
- Budget: 180
- Pre: no binding in the scratch project (fresh deployment, or `DELETE /` as user A beforehand).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO CAPTURE-FORWARD
  3. MACRO REPLAY-FORWARD GET /managed-mcp-identity null null
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] `GET .../managed-mcp-identity` answers 404 with `code: "IDENTITY_MCP_NOT_CONFIGURED"`; the bootstrap has `identityMcpConfigured: false`.
  A2 [DOM] as user A the app shows the binding setup (Managed MCP server setup, "Create a new Managed MCP" / "Use an existing Managed MCP"), and no chat composer (the gate wins).
  A3 [CONSOLE] no error-level message from app code.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json
- Status: NOT RUN

### E2E-I-02 - Administrator binds, non-admin is refused (also with forged hints)
- Spec: i-identity-managed-mcp / binding writes require administrator access
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: an identity-mode server key `e2e-ai-assistant` exists or can be created in the scratch project (M11); user A and user B attached.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD PUT /managed-mcp-identity {"serverKey":"e2e-ai-assistant"} {"x-admin-email":"admin@example.invalid"}
  3. MACRO REPLAY-FORWARD PUT /managed-mcp-identity {"serverKey":"e2e-ai-assistant","userEmail":"admin@example.invalid","isAdmin":true} null
  4. MACRO REPLAY-FORWARD GET /managed-mcp-identity null null
- Assert:
  A1 [NET] as user B (on `chrome-devtools-b`): steps 2 and 3 answer 403 `code: "ADMIN_REQUIRED"`; step 4 still shows the previous state.
  A2 [NET] as user A: step 2 (without the forged header, run `MACRO REPLAY-FORWARD PUT /managed-mcp-identity {"serverKey":"e2e-ai-assistant"} null`) answers 200 with the public binding (server key, no secret, no client secret); an unreachable or wrong-mode server answers a 4xx with a readable message (record the body; BLOCKED(M11) if the server cannot be bound).
  A3 [NET] a binding that already exists is replaced only by an explicit second `PUT` (idempotent).
- Cleanup: unbind in `E2E-I-07`, or leave bound for I-03 to I-06.
- Evidence: replay-results.json
- Status: NOT RUN

### E2E-I-03 - Connect my account (popup, consent, connected)
- Spec: i-identity-managed-mcp / authorize, callback, token storage
- Tags: smoke, needs:M8, needs:second-user
- Env: both (for the cross-instance variant see `E2E-V-05`)
- Budget: 300
- Pre: binding exists (I-02); the test user is not connected yet (`GET /status` shows `connected: false`).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Connect my account">}
  4. mcp__chrome-devtools__list_pages {}
  5. mcp__chrome-devtools__select_page {pageId: <popup page id>, bringToFront: true}
  6. mcp__chrome-devtools__take_snapshot {pageId: <popup page id>}
  7. mcp__chrome-devtools__click {pageId: <popup page id>, uid: <uid of the consent button, only if the login session asks for consent>}
  8. mcp__chrome-devtools__list_pages {}
  9. mcp__chrome-devtools__select_page {pageId: $P, bringToFront: true}
  10. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…"], timeout: 60000}
  11. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-identity-tokens`
  12. SHELL: `node scripts/e2e/co.mjs grep ai-assistant-identity-tokens refresh_token access_token`
- Assert:
  A1 [NET] `POST .../authorize` answers 200 with `connected: false` and an `authorizationUrl` whose host is the Merchant Center authorization server (the card records only the host, never the query).
  A2 [DOM] the popup shows "Connected" / "Your commercetools account is connected." (or closes itself) and the gate disappears in the app.
  A3 [NET] `GET .../status` answers `connected: true`; `POST .../verify` answers 200 with a tool count above zero.
  A4 [CO] a token object for the user exists and holds only an encrypted envelope: no plaintext `refresh_token` or `access_token`; the recorded `scope` contains `mcp:` (settles OQ-I1; record the value as text in the evidence).
  A5 [CO] `ai-assistant-identity-auth-states` holds no leftover state object for this attempt.
- Cleanup: none (I-04 needs the connection).
- Evidence: snapshot-final.txt, screenshot-final.png, network.json, co-shapes.txt (no ciphertext)
- Status: NOT RUN

### E2E-I-04 - A chat turn uses the user's own tools
- Spec: i-identity-managed-mcp / tool source with the user's permissions
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: user connected (I-03); tool-call-log mode `all` or `tools`.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-i04: list my 5 latest orders"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. MACRO REPLAY-FORWARD GET /session/<sessionId>/tools null null
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the stream completes with no `error` chunk.
  A2 [DOM] a tool part from the `commercetools` source appears in the transcript (tool-steps pill or block); soft: it lists orders.
  A3 [NET] the tools response lists only tools permitted for this user (read-only preset: no `create`/`update`/`delete` tools when the server was created read-only).
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt, tools.json
- Status: NOT RUN

### E2E-I-05 - Disconnect asks to reconnect
- Spec: i-identity-managed-mcp / disconnect (`DELETE /me`)
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: user connected.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD DELETE /managed-mcp-identity/me null null
  3. MACRO REPLAY-FORWARD GET /managed-mcp-identity/status null null
  4. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  5. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Connect my account"], timeout: 60000}
- Assert:
  A1 [NET] step 2 answers 200; step 3 shows `connected: false`.
  A2 [DOM] after the reload the connect gate (`Connect my account`) is shown instead of the chat.
  A3 [CO] the user's token object is gone or marked revoked.
  A4 [NET] a chat call made by replay (`POST /ai-chat/<id>/message/stream`) answers with the reconnect indication (`IDENTITY_REAUTH_REQUIRED`) rather than an unrelated error; record the body.
- Cleanup: reconnect with the `E2E-I-03` steps if later cards need the connection.
- Evidence: replay-results.json, snapshot-final.txt
- Status: NOT RUN

### E2E-I-05b - A user with no permitted tools
- Spec: i-identity-managed-mcp / `IDENTITY_NO_PERMITTED_TOOLS` (403)
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: a Merchant Center user whose Team has no permission mapped to any tool of the bound server; the card is BLOCKED(M10) when such a user is not available (do not edit permissions of users A or B for this). The wording of the 403 body is not documented; this card captures the real body to tighten the wire-test regex.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO SEND text="e2e-i05b: list my latest orders"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [NET] the stream or `POST /verify` answers 403 with `code: "IDENTITY_NO_PERMITTED_TOOLS"`; the full body is saved in the evidence.
  A2 [DOM] the UI shows a readable message, not a raw JSON dump.
- Cleanup: none.
- Evidence: forbidden-body.json, snapshot-final.txt
- Status: NOT RUN

### E2E-I-06 - The callback URL works once
- Spec: i-identity-managed-mcp / single-use state, replay rejected
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 300
- Pre: binding exists, the user is disconnected. The agent runs the flow in a normal page, not a popup, so that the callback URL can be read.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD POST /managed-mcp-identity/authorize {} null
  3. mcp__chrome-devtools__new_page {url: "<authorizationUrl from step 2>"}
  4. mcp__chrome-devtools__list_pages {}
  5. mcp__chrome-devtools__wait_for {pageId: <new page id>, text: ["Your commercetools account is connected", "Connected"], timeout: 60000}
  6. mcp__chrome-devtools__list_pages {}
  7. mcp__chrome-devtools__new_page {url: "<the callback URL read from list_pages in step 6>"}
  8. mcp__chrome-devtools__take_snapshot {pageId: <second new page id>}
- Assert:
  A1 [DOM] step 5 shows the success text; the first callback answered 200.
  A2 [DOM] the second visit answers 400 and shows "The connection could not be completed." (already used or expired); no second token exchange appears in the service log (one token request only).
  A3 [CO] exactly one token object exists for the user and the state object was deleted.
- Cleanup: close both pages with `close_page`; the callback URL is never written to evidence (state and code are secrets); disconnect if later cards expect it.
- Evidence: snapshot-final.txt, service-log-excerpt.txt (state and code masked)
- Status: NOT RUN

### E2E-I-07 - Administrator unbinds
- Spec: i-identity-managed-mcp / unbind removes tokens
- Tags: regression, destructive, needs:M8, needs:second-user
- Env: both
- Budget: 240
- Pre: binding and at least one connected user.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD DELETE /managed-mcp-identity null null
  3. MACRO REPLAY-FORWARD GET /managed-mcp-identity/status null null
  4. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-identity-tokens`
- Assert:
  A1 [NET] as user B (non-admin) the same `DELETE` answers 403 `ADMIN_REQUIRED` and nothing changes; as user A it answers 200.
  A2 [NET] `GET /status` answers `configured: false` for every user.
  A3 [CO] the token container is empty (no token objects).
  A4 [DOM] after a reload as user A the binding setup is shown again.
- Cleanup: rebind with `E2E-I-02` if later cards need it.
- Evidence: replay-results.json, snapshot-final.txt
- Status: NOT RUN

## Coverage

- Binding, connect, use, disconnect, forbidden, replay, unbind: `E2E-I-01` to `E2E-I-07`; multi-instance safety of the PKCE state: `E2E-V-05`; the connect pages of the apps: `E2E-Q-01` to `E2E-Q-04` (`mc-app`) and `E2E-S-05`, `E2E-S-06` (`mc-view-app`).
- Not covered: token refresh rotation grace (OQ-I2, needs a long-running session), revocation at the authorization server, DCR client lifecycle details (wire tests).
