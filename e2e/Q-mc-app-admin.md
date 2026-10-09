# Playbook Q: admin surfaces of `mc-app`

Owning change: `q-mc-app-admin-surfaces` (ids `E2E-Q-01` to `E2E-Q-16` are defined in its `tasks.md`
section 11; the V design's Q numbering lost). An administrator is a user whose Merchant Center user id
is in `ADMIN_USER_IDS` (user A); user B is not. Interface names (from the code): heading
`Administrator access required`, rail item `Connections`, binding page `Managed MCP server setup`
(`Create a new Managed MCP`, `Use an existing Managed MCP`, `Current binding`), `Connect my account`,
settings sections `About` (with "Your user ID"), `Detail level`, `System prompt`, `Connected sources`
(three provider cards), backoffice at `$APP_URL/backoffice` with tabs `Thread List`, `Query Threads`,
`Feedback` (`Backoffice sections`). The sentence for non-admins is "Ask an administrator to add your
user ID to ADMIN_USER_IDS".

### E2E-Q-01 - Administrator binds an unbound project
- Spec: q-mc-app-admin-surfaces / managed MCP binding page
- Tags: regression, destructive, needs:M8, needs:deployment
- Env: both
- Budget: 480
- Pre: no binding (`E2E-I-07` or a fresh project); an identity-mode server can be created in the scratch project (M11).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Create a new Managed MCP">}
  4. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of the key field>, value: "e2e-ai-assistant"}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the submit button>}
  6. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  7. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-01/snapshot-final.txt"}
- Assert:
  A1 [NET] `POST .../mcp-servers` (through `/proxy/ctp`) answered 201 with `authenticationMode: CommercetoolsIdentity`, then `PUT .../service/managed-mcp-identity` answered 200.
  A2 [DOM] the UI advances to the connect gate (or chat when already connected); with `identityMcpConfigured: false` the chat never rendered before the bind.
  A3 [CONSOLE] no error-level message.
- Cleanup: keep the binding for Q-03 to Q-06; the server `e2e-ai-assistant` is deleted at the end of `E2E-Q-05`.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-Q-02 - Non-admin sees the notice on an unbound project
- Spec: q-mc-app-admin-surfaces / non-admin binding gate
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 240
- Pre: the binding was removed by user A first (`E2E-I-07`); user B attached.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  3. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({inputs: document.querySelectorAll('input, textarea').length, text: document.body.innerText.includes('Administrator access required')})"}
- Assert:
  A1 [DOM] the heading `Administrator access required` is shown with no permission name and no e-mail address; no inputs for key or tools.
  A2 [NET] no `POST .../mcp-servers` and no `PUT .../managed-mcp-identity` request was made.
- Cleanup: rebind as user A if later cards need it.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-Q-03 - Connect my account
- Spec: q-mc-app-admin-surfaces / connect gate
- Tags: regression, needs:M8, needs:deployment
- Env: both
- Budget: 480
- Pre: bound project, user not connected (disconnect first). Same flow as `E2E-I-03`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Connect my account">}
  3. mcp__chrome-devtools__list_pages {}
  4. mcp__chrome-devtools__select_page {pageId: <popup page id>, bringToFront: true}
  5. mcp__chrome-devtools__take_snapshot {pageId: <popup page id>}
  6. mcp__chrome-devtools__click {pageId: <popup page id>, uid: <uid of "Allow", only when asked>}
  7. mcp__chrome-devtools__select_page {pageId: $P, bringToFront: true}
  8. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [DOM] the gate disappears and the chat is visible.
  A2 [NET] `POST .../managed-mcp-identity/authorize` 200, `GET .../status` with `connected: true`, `POST .../verify` with a tool count above zero.
  A3 [CONSOLE] no error-level message.
- Cleanup: none. A blocked popup is not simulable and is covered by code review.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-Q-04 - Disconnect and reconnect
- Spec: q-mc-app-admin-surfaces / account card
- Tags: regression, needs:M8, needs:deployment
- Env: both
- Budget: 480
- Pre: connected user.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Disconnect my account">}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  5. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Connect my account"], timeout: 30000}
- Assert:
  A1 [NET] `DELETE .../managed-mcp-identity/me` answered 200.
  A2 [DOM] the connect gate appears; reconnecting with the `E2E-Q-03` steps returns to the chat.
- Cleanup: reconnect.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-Q-05 - Connections drawer
- Spec: q-mc-app-admin-surfaces / administrator-only connections
- Tags: regression, destructive, needs:M8, needs:second-user, needs:deployment
- Env: both
- Budget: 480
- Pre: bound project; users A and B attached.
- Steps:
  1. mcp__chrome-devtools__take_snapshot {pageId: $P}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the rail item "Connections">}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-05/snapshot-admin.txt"}
- Assert:
  A1 [DOM] as user A the rail shows `Connections`; the bound server is marked in use; removing the binding returns the gate.
  A2 [DOM] as user B (on `chrome-devtools-b`) the rail has no `Connections` item.
  A3 [DOM] the `e2e-ai-assistant` server is deleted afterwards through the Merchant Center UI (Settings, Developer settings, MCP servers) by the operator; the card records the step as manual.
- Cleanup: delete the `e2e-ai-assistant` server.
- Evidence: snapshot-admin.txt, snapshot-nonadmin.txt
- Status: NOT RUN

### E2E-Q-06 - Detail level
- Spec: q-mc-app-admin-surfaces / tool-call-log mode control
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: user A; the original mode is read first.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Detail level">}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the option Off>}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Save>}
  6. MACRO NEW-CHAT
  7. MACRO SEND text="e2e-q06: search the commercetools docs for custom objects"
  8. MACRO WAIT-STREAM-DONE timeoutMs=180000
  9. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [NET] the save sent `PUT .../tool-call-logs` with `mode: "none"`.
  A2 [DOM] no tool pill is shown in the answer; after saving Detailed the tool detail shows on the next message.
  A3 [DOM] as user B the detail-level control is absent.
- Cleanup: restore the original mode; delete the session.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-Q-07 - System prompt
- Spec: q-mc-app-admin-surfaces / system prompt editor
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: user A; the original prompt is read first (variable).
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of "System prompt">, value: "e2e-prompt: end every answer with the word EOT."}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Save>}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. MACRO SEND text="e2e-q07: say hi"
  8. MACRO WAIT-STREAM-DONE timeoutMs=120000
- Assert:
  A1 [NET] `PUT .../system-prompt` answered 200.
  A2 [DOM] after the reload the field holds the saved value; soft: the reply ends with `EOT`; structurally the stream completes.
  A3 [DOM] as user B the System prompt section is absent.
- Cleanup: restore the original prompt; delete the session.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-Q-08 - Provider status cards (administrator)
- Spec: q-mc-app-admin-surfaces / connected sources
- Tags: regression, needs:M8, needs:secrets
- Env: both
- Budget: 300
- Pre: user A. See `E2E-J-02` for the dummy configuration.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-08/snapshot-final.txt"}
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({inputs: document.querySelectorAll('input, form').length, buttons: [...document.querySelectorAll('button')].map(b => b.innerText).filter(t => /save/i.test(t))})"}
  5. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of GET .../mcp/providers>}
- Assert:
  A1 [DOM] three cards (Contentstack, Algolia, Stripe), each with the text "Configured at deployment (Connect configuration)" and a badge matching the `GET mcp/providers` response; with nothing configured all three show "Not configured" with their missing key names.
  A2 [DOM] the section contains no input, form or Save button within the cards.
  A3 [DOM] an enabled provider (for example Stripe with the dummy key) appears as a group in the Tools panel; `commercetools` and `commercetools-knowledge` have no card.
- Cleanup: none.
- Evidence: snapshot-final.txt, providers.json
- Status: NOT RUN

### E2E-Q-09 - Settings as non-admin
- Spec: q-mc-app-admin-surfaces / read-only experience for non-administrators
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: user B on `chrome-devtools-b`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-09/snapshot-final.txt"}
  5. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({passwordInputs: document.querySelectorAll('input[type=password]').length, textareas: document.querySelectorAll('textarea').length, text: document.body.innerText.includes('Ask an administrator to add your user ID to ADMIN_USER_IDS')})"}
- Assert:
  A1 [DOM] the same three provider cards render with the same text as for user A.
  A2 [DOM] no password input; the only textarea on the page is none in the System prompt area; no Connections item, no detail-level control, no backoffice link.
  A3 [DOM] the About section shows the user id and the sentence "Ask an administrator to add your user ID to ADMIN_USER_IDS".
- Cleanup: none.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-Q-10 - Backoffice guard
- Spec: q-mc-app-admin-surfaces / backoffice route guard
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: users A and B attached.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Administrator access required", "Thread List"], timeout: 60000}
  3. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-10/snapshot-final.txt"}
- Assert:
  A1 [DOM] as user B: "Administrator access required" and no tabs; as user A: tabs `Thread List`, `Query Threads`, `Feedback`.
  A2 [NET] as user B no request to `backoffice/threads` or `feedback/fetch`.
- Cleanup: none.
- Evidence: snapshot-admin.txt, snapshot-nonadmin.txt, network.json
- Status: NOT RUN

### E2E-Q-11 - Thread list and detail
- Spec: q-mc-app-admin-surfaces / backoffice thread list
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: user A; at least one chat from earlier scenarios.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the per-page control>}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of a thread row>}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-11/snapshot-final.txt"}
- Assert:
  A1 [DOM] rows are present and there is no "Project" column.
  A2 [NET] changing the per-page value changes the `limit` and `offset` of the request.
  A3 [DOM] clicking a row opens `/backoffice/<sessionId>` and shows the messages.
- Cleanup: none.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-Q-12 - Query threads (alaSQL in the browser)
- Spec: q-mc-app-admin-surfaces / thread query tab
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: user A on `$APP_URL/backoffice`.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the tab "Query Threads">}
  2. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of the query box>, value: "SELECT COUNT(*) AS n FROM threads"}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Run>}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of the query box>, value: "SELEC nope"}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Run>}
  7. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error"]}
- Assert:
  A1 [DOM] a result row with `n` is shown and no additional request to the service was made by Run.
  A2 [DOM] the wrong statement shows an inline error and the page stays interactive.
  A3 [CONSOLE] no uncaught console error.
- Cleanup: none.
- Evidence: snapshot-final.txt, console.txt
- Status: NOT RUN

### E2E-Q-13 - Feedback list and detail
- Spec: q-mc-app-admin-surfaces / feedback review
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: feedback exists (`E2E-P-09` or `E2E-N-01`); user A.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Detail level">}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the option Off>}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Save>}
  6. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the tab "Feedback">}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the e2e entry>}
  9. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => [...document.querySelectorAll('pre, code')].map(e => getComputedStyle(e).maxHeight)"}
- Assert:
  A1 [DOM] the list shows metadata only (no message text in the table).
  A2 [DOM] the detail shows reasoning and tool parts regardless of the admin's own detail level (set to Off in steps 3 to 5).
  A3 [DOM] JSON blocks have a max height of 240px.
- Cleanup: restore the detail level.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-Q-14 - No secrets leak
- Spec: q-mc-app-admin-surfaces / no credential values in the browser
- Tags: regression, negative, needs:M8, needs:second-user, needs:secrets
- Env: both
- Budget: 480
- Pre: at least one provider configured with a dummy value (`sk_test_e2edummykey`); run as user A and as user B.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of GET .../mcp/providers>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-Q-14/providers.json"}
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({domHit: document.documentElement.innerHTML.includes('sk_test_e2edummykey'), storageHit: JSON.stringify(localStorage).includes('sk_test_e2edummykey'), inputs: [...document.querySelectorAll('input')].some(i => (i.value || '').includes('sk_test_e2edummykey'))})"}
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 100}
- Assert:
  A1 [NET] the providers body contains only `provider`, `configured`, `enabled`, `missingKeys` and none of the deployment values.
  A2 [DOM] `domHit`, `storageHit` and the input check are all false.
  A3 [NET] no request to `mcp/configs*` was made.
- Cleanup: none.
- Evidence: providers.json, scan.json
- Status: NOT RUN

### E2E-Q-15 - A forged label does not grant admin
- Spec: q-mc-app-admin-surfaces / forged identity hints (see also `E2E-V-12`)
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 480
- Pre: user B on `chrome-devtools-b`.
- Steps:
  1. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => { localStorage.setItem('userEmail', 'admin@example.invalid'); return true; }"}
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  3. MACRO CAPTURE-FORWARD
  4. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-q15","userEmail":"admin@example.invalid","userLabel":"admin@example.invalid"} {"x-admin-email":"admin@example.invalid"}
  5. MACRO REPLAY-FORWARD PUT /managed-mcp-identity {"serverKey":"e2e-ai-assistant"} {"x-admin-email":"admin@example.invalid"}
  6. MACRO REPLAY-FORWARD POST /backoffice/threads {"userEmail":"admin@example.invalid"} null
  7. MACRO REPLAY-FORWARD GET /feedback/fetch?userEmail=admin@example.invalid null null
  8. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-q15"} {"x-admin-user-id":"<user-id-a>"}
- Assert:
  A1 [NET] every replay answers 403 with `code: "ADMIN_REQUIRED"`.
  A2 [DOM] the UI still shows the non-admin experience (no Connections, no backoffice link); the bootstrap still has `isAdmin: false`.
- Cleanup: remove the planted `localStorage` key.
- Evidence: q15-network.json (values redacted)
- Status: NOT RUN

### E2E-Q-16 - Own user id and becoming an administrator
- Spec: q-mc-app-admin-surfaces / About section and notice
- Tags: regression, destructive, needs:M8, needs:second-user, needs:deployment
- Env: both
- Budget: 600
- Pre: user B's id is not in `ADMIN_USER_IDS`; `E2E_ALLOW_DESTRUCTIVE=1`. The empty-list bootstrap is `E2E-V-13`.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "About">}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-Q-16/snapshot-about.txt"}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. SHELL: `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id of A>,<id of B>` (local: restart the service with the value)
  8. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  9. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [DOM] as user B the About section and the notice at `$APP_URL/backoffice` show the same user id as the bootstrap `data.userId` and the ADMIN_USER_IDS sentence; Copy works.
  A2 [NET] after step 7 and a reload the bootstrap has `isAdmin: true`; Connections and the backoffice link appear; the sentence is gone.
- Cleanup: restore the previous `ADMIN_USER_IDS` value.
- Evidence: snapshot-about.txt, screenshot-final.png (ids replaced by placeholders)
- Status: NOT RUN

## Coverage

- Binding and connect: `E2E-Q-01` to `E2E-Q-05`; settings: `E2E-Q-06` to `E2E-Q-09`, `E2E-Q-14`; backoffice: `E2E-Q-10` to `E2E-Q-13`; forged identity and bootstrap: `E2E-Q-15`, `E2E-Q-16`, `E2E-V-03`, `E2E-V-12`, `E2E-V-13`.
- Not covered: the Merchant Center MCP-server creation form details beyond the request shape, the ReauthenticateDialog (`E2E-O-05`, `E2E-V-02`).
