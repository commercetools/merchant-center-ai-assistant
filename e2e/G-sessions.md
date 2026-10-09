# Playbook G: chat sessions, digest, suggestions, tools menu, settings endpoints

Owning change: `g-chat-sessions-and-digest` (ids `E2E-G-01` to `E2E-G-08` are defined in its
`tasks.md`). All run in `mc-app` as user A unless a card says user B. Routes (service, behind the
gateway): `POST /service/session`, `GET /service/session` (last), `GET /service/session/all`,
`GET|PUT|DELETE /service/session/:id`, `GET /service/session/:id/messages|digest|tools`,
`PUT /service/session/:id/tools`, `GET /service/suggestions`, `GET|PUT /service/system-prompt`,
`GET|PUT /service/tool-call-logs`. Feature flags travel in the query (`customView`).

### E2E-G-01 - New chat creates a session shown in the drawer
- Spec: g-chat-sessions-and-digest / session create and list
- Tags: smoke, needs:M8
- Env: both
- Budget: 120
- Pre: `E2E-V-01` passed; app open as user A.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO NEW-CHAT
  3. MACRO SEND text="e2e-g01: hi"
  4. MACRO WAIT-STREAM-DONE timeoutMs=120000
  5. MACRO RECORD-SESSION
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the rail item "Chats">}
  8. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-G-01/snapshot-final.txt"}
- Assert:
  A1 [NET] one `POST .../service/session` answered 200 with an `id` (UUID) and `title: "New chat"` (or the default title).
  A2 [DOM] the Chats drawer lists the new session (title "New chat" or the digest title).
  A3 [CO] `node scripts/e2e/co.mjs shape ai-assistant-sessions <id>` shows `userId` equal to the bootstrap `userId` of user A (compare without printing).
  A4 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session in the drawer (see `E2E-G-02`) or `cleanup.mjs --run $RUN`.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json
- Status: NOT RUN

### E2E-G-02 - List, limit and delete leave no orphan
- Spec: g-chat-sessions-and-digest / list and delete
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: at least two `e2e-` sessions exist (create them with `E2E-G-01` steps twice).
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD GET /session/all null null
  3. MACRO REPLAY-FORWARD GET /session/all?limit=1 null null
  4. MACRO REPLAY-FORWARD DELETE /session/<sessionId> null null
  5. MACRO REPLAY-FORWARD GET /session/<sessionId> null null
  6. MACRO REPLAY-FORWARD GET /session/<sessionId>/messages null null
  7. SHELL: `node scripts/e2e/co.mjs list --prefix ai-assistant-messages-<sessionId>`
- Assert:
  A1 [NET] step 2 returns the user's sessions newest first (count at least 2) and only sessions of user A; step 3 returns one session.
  A2 [NET] step 4 answers 200; steps 5 and 6 answer 404.
  A3 [CO] step 7 lists no message objects.
  A4 [DOM] after a reload the deleted session is not in the Chats drawer.
- Cleanup: delete remaining `e2e-` sessions with `cleanup.mjs --run $RUN`.
- Evidence: replay-results.json, network.json
- Status: NOT RUN

### E2E-G-03 - Digest arrives after a turn (title and follow-up chips)
- Spec: g-chat-sessions-and-digest / session digest, never awaited on the stream
- Tags: regression, needs:M8, needs:service-account
- Env: both (the digest runs after the response; confirms the runtime keeps CPU after close, risk R-G1 of change G)
- Budget: 240
- Pre: the lite model works (`E2E-F-01` passed).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-g03: explain in two sentences what a cart is in commercetools"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Chats"], timeout: 10000}
  5. MACRO REPLAY-FORWARD GET /session/<sessionId>/digest null null
  6. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-G-03/snapshot-final.txt"}
- Assert:
  A1 [NET] the stream request finished without waiting for the digest (stream duration well below the time at which the digest appears).
  A2 [NET] within 30 s after the stream the digest response has a non-default `title` (not "New chat") and, soft, one to three `nextPrompts`.
  A3 [DOM] the Chats drawer shows the digest title and up to three follow-up chips appear under the reply (also `E2E-P-08`).
  A4 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session.
- Evidence: digest.json, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-G-04 - Suggestions return four cards
- Spec: g-chat-sessions-and-digest / suggestions with cache
- Tags: smoke, needs:M8
- Env: both
- Budget: 120
- Pre: app open as user A.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD GET /suggestions null null
  3. MACRO REPLAY-FORWARD GET /suggestions null null
  4. SHELL: `node scripts/e2e/co.mjs shape ai-assistant-suggestions`
- Assert:
  A1 [NET] both calls answer 200 with four suggestion cards (for a new user or when the model is unavailable the built-in defaults).
  A2 [NET] the second response is served faster than the first (cache), soft; recorded only.
  A3 [CO] a cache object exists for user A in `ai-assistant-suggestions` after a model-backed run (SKIPPED when the model is off).
- Cleanup: none.
- Evidence: suggestions.json, network.json
- Status: NOT RUN

### E2E-G-05 - Tools menu toggle persists after reload
- Spec: g-chat-sessions-and-digest / per-session tools menu, negative list
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: a session with at least one message (menu is per session); the Tools panel is the composer button "Choose what the assistant can reach".
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-g05: hi"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  6. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of "Filter tools">, value: "order"}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of one tool switch>}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Save button>}
  9. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  10. MACRO REPLAY-FORWARD GET /session/<sessionId>/tools null null
- Assert:
  A1 [NET] `PUT .../session/<id>/tools` answers 200 once.
  A2 [NET] after the reload `GET .../tools` marks the toggled tool as disabled (the stored disabled-tools list is a negative list).
  A3 [DOM] reopening the panel shows the tool still off.
  A4 [CONSOLE] no error-level message.
- Cleanup: re-enable the tool (toggle and Save) so later cards see all tools; delete the session.
- Evidence: tools-before.json, tools-after.json, snapshot-final.txt
- Status: NOT RUN

### E2E-G-06 - System prompt: admin saves, non-admin gets 403
- Spec: g-chat-sessions-and-digest / system prompt endpoints behind requireAdmin
- Tags: regression, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: user A on `chrome-devtools`, user B on `chrome-devtools-b`; the original prompt is read first.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. MACRO CAPTURE-FORWARD
  4. MACRO REPLAY-FORWARD PUT /system-prompt {"systemPrompt":"e2e-g06"} null
  5. MACRO REPLAY-FORWARD GET /system-prompt null null
- Assert:
  A1 [NET] as user A: step 4 answers 200 and step 5 returns `e2e-g06`.
  A2 [NET] as user B (repeat steps 1 to 5 on `chrome-devtools-b`): step 4 answers 403 `code: "ADMIN_REQUIRED"` and step 5 still returns the value saved by A.
  A3 [DOM] as user B the Settings page has no editable System prompt control (see `E2E-Q-09`); as user A it has.
- Cleanup: restore the original system prompt as user A.
- Evidence: replay-results.json, snapshot-final.txt
- Status: NOT RUN

### E2E-G-07 - Custom-view session isolation
- Spec: g-chat-sessions-and-digest / feature flags via query (`customView`)
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: change S panel reachable at `$HOST_PAGE_URL`; one plain `e2e-` session exists in `mc-app`.
- Steps:
  1. MACRO OPEN-APP $HOST_PAGE_URL
  2. MACRO SEND text="e2e-g07: hi from the panel"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. MACRO CAPTURE-FORWARD
  5. MACRO REPLAY-FORWARD GET /session/all?customView=product null null
  6. MACRO REPLAY-FORWARD GET /session/all null null
- Assert:
  A1 [NET] every forwarded service URL of the panel carries the `customView` query parameter (read the `x-forward-to` header of each request).
  A2 [NET] the flagged list (step 5) contains the panel session; the plain list (step 6) does not, and the plain `mc-app` session is not in the flagged list.
  A3 [CONSOLE] no error-level message.
- Cleanup: delete both sessions.
- Evidence: replay-results.json, network.json
- Status: NOT RUN

### E2E-G-08 - Tool-call-log mode round trip
- Spec: g-chat-sessions-and-digest / tool-call-log endpoints
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: user A; current mode read first.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD GET /tool-call-logs null null
  3. MACRO REPLAY-FORWARD PUT /tool-call-logs {"mode":"none"} null
  4. MACRO REPLAY-FORWARD GET /tool-call-logs null null
  5. MACRO REPLAY-FORWARD PUT /tool-call-logs {"mode":"bogus"} null
  6. MACRO REPLAY-FORWARD PUT /tool-call-logs {"mode":"<original>"} null
- Assert:
  A1 [NET] step 3 answers 200; step 4 returns mode `none`.
  A2 [NET] step 5 answers 400 with the list of valid modes.
  A3 [NET] step 6 restores the original mode; a reload of the app shows the same mode in Settings > Detail level (see `E2E-Q-06`).
- Cleanup: the mode is restored by step 6.
- Evidence: replay-results.json
- Status: NOT RUN

## Coverage

- Session CRUD, listing and flags: `E2E-G-01`, `E2E-G-02`, `E2E-G-07`; digest: `E2E-G-03`; suggestions: `E2E-G-04`; tools menu: `E2E-G-05`; settings endpoints and admin gating: `E2E-G-06`, `E2E-G-08`.
- Not covered by a browser card: per-user list cap of 500 sessions, the message paging parameters (wire tests), `sanitizeUserLabel`, temporary tables of change L (see `E2E-L-01`).
