# Playbook E: persistence on Custom Objects

Owning change: `e-persistence-custom-objects`. E has no UI; its own tasks list no Chrome ids (V.5
says the feature changes G, I and N exercise the layer). These three cards use the app to create
data and read the Custom Objects through `scripts/e2e/co.mjs` (the `CO` oracle: list and read
objects of the scratch project with the dev API client from `service/.env.local`; it prints container,
key, version and a redacted structural view of the value, never secret fields or ciphertext).

Container names (change E, `service/src/persistence/names.ts`): `ai-assistant-settings`,
`ai-assistant-sessions`, `ai-assistant-messages-<sessionId>`, `ai-assistant-identity-tokens`,
`ai-assistant-identity-auth-states`, `ai-assistant-feedback`, `ai-assistant-feedback-snap-<feedbackId>`,
`ai-assistant-suggestions`.

### E2E-E-01 - Containers exist and secrets are encrypted at rest
- Spec: e-persistence-custom-objects / repository over Custom Objects, AES-256-GCM envelope
- Tags: smoke, regression, needs:M8
- Env: both
- Budget: 300
- Pre: `E2E-V-01` passed; the app is open as user A; at least one chat message was sent (any `e2e-` message); the identity MCP of the scratch project is connected for user A (after `E2E-I-03`) so that a token object exists; otherwise A5 is skipped.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO NEW-CHAT
  3. MACRO SEND text="e2e-e01: reply with one short sentence"
  4. MACRO WAIT-STREAM-DONE timeoutMs=120000
  5. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-`
  6. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-sessions`
  7. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-identity-tokens`
  8. SHELL: `node scripts/e2e/co.mjs grep ai-assistant-identity-tokens refresh_token accessToken access_token`
- Assert:
  A1 [CO] containers `ai-assistant-sessions` and `ai-assistant-messages-<the new session id>` exist and the session object has `userId` (not an e-mail), `title`, timestamps and `schemaVersion`.
  A2 [CO] the messages container holds objects whose values are structured parts (opaque JSON), none with an e-mail address.
  A3 [CO] `ai-assistant-settings` exists after the first settings write (it may be absent on a fresh project until a setting is saved; then the card records SKIPPED for this assertion only).
  A4 [CO] objects in `ai-assistant-identity-tokens` have an envelope shape (kind, kid, iv, ciphertext fields, version marker) and the grep for plaintext `refresh_token` / `accessToken` / `access_token` finds nothing.
  A5 [CO] no object value anywhere under `ai-assistant-` contains the strings `Bearer `, `BEGIN PRIVATE KEY`, the encryption key variable name or a value of any `*_KEY` configuration.
  A6 [CONSOLE] no error-level message from app code.
- Cleanup: delete the `e2e-` session in the UI (as in `E2E-P-05`) or `node scripts/e2e/cleanup.mjs --run $RUN`.
- Evidence: containers.txt, shapes.txt (redacted), snapshot-final.txt
- Status: NOT RUN

### E2E-E-02 - Settings persist and concurrent saves both succeed
- Spec: e-persistence-custom-objects / settings object with optimistic concurrency retry
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: user A on `$P` and a second tab of the same app; the current system prompt is read first (Cleanup restores it).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__new_page {url: "<same app URL>", background: false}
  3. mcp__chrome-devtools__list_pages {}
  4. MACRO CAPTURE-FORWARD
  5. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "async () => { const c = window.__e2eForward; const call = (v) => fetch(c.url, {method: 'PUT', credentials: 'include', cache: 'no-store', headers: {...c.headers, 'x-forward-to': '<SERVICE_URL>/service/system-prompt', 'content-type': 'application/json'}, body: JSON.stringify({systemPrompt: v})}).then(r => r.status); return await Promise.all([call('e2e-e02-a'), call('e2e-e02-b'), call('e2e-e02-c')]); }"}
  6. MACRO REPLAY-FORWARD GET /system-prompt null null
  7. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-settings`
- Assert:
  A1 [NET] all three simultaneous PUTs answer 200 (the service retries a version conflict internally; none answers 409 or 500).
  A2 [NET] the following GET returns exactly one of the three values (last writer wins) and the value is the same on a second GET.
  A3 [CO] the settings object has a single `version` increase pattern (version greater than before) and holds the same value.
- Cleanup: restore the original system prompt with a PUT as user A; close the second page with `close_page`.
- Evidence: put-statuses.json, settings-shape.txt
- Status: NOT RUN

### E2E-E-03 - Deleting a session removes its messages
- Spec: e-persistence-custom-objects / delete cascade
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: app open as user A; no other test is running.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-e03: say hi"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. MACRO RECORD-SESSION
  5. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-messages-<sessionId>`
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the row action "Delete chat" for this session>}
  8. mcp__chrome-devtools__take_snapshot {pageId: $P}
  9. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the confirm button of the delete dialog>}
  10. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-messages-<sessionId>`
  11. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-sessions <sessionId>`
- Assert:
  A1 [CO] step 5 lists at least the two messages (user and assistant).
  A2 [NET] `DELETE .../service/session/<sessionId>` answers 200.
  A3 [CO] step 10 lists no objects and step 11 reports the session object as absent.
  A4 [DOM] the row is gone from the Chats drawer.
- Cleanup: none (the session was the test data).
- Evidence: before.txt, after.txt, snapshot-final.txt
- Status: NOT RUN

## Coverage

- Repository, codecs, encryption, optimistic concurrency, delete cascade: `E2E-E-01` to `E2E-E-03`.
  `E2E-V-04` (restart) and `E2E-V-05` (multi-instance) prove that no state lives in the process.
- Not covered by a browser card: container size limits, retry classification, key rotation
  (`npm run persistence:reencrypt`), the probes of `npm run test:integration` (run those with the
  scratch project's API client).
