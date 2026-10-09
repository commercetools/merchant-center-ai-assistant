# Playbook P: the chat surface of `mc-app`

Owning change: `p-mc-app-chat-surface` (ids `E2E-P-01` to `E2E-P-16` are defined in its `tasks.md`
section 20). Interface names (from the code): composer placeholder `Ask about products, orders,
pricing or promotions…`, button `Send message`, rail tile `Start a new chat`, rail item `Chats` with
search `Search your chats` and row action `Delete chat`, composer button `Choose what the assistant
can reach` with search `Filter tools`, popup field `What went wrong`, `Close feedback`, `Start
feedback mode`, `Save Page`, `Page settings`, `Delete page`, rail menu `Account`. No `data-testid`
exists; selectors are accessible names. The stored session id is `localStorage['chat-session-id']`.

### E2E-P-01 - First load
- Spec: p-mc-app-chat-surface / empty state, bootstrap requests
- Tags: smoke, needs:M8
- Env: both
- Budget: 120
- Pre: `E2E-V-01` passed.
- Steps:
  1. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => { localStorage.removeItem('chat-session-id'); return true; }"}
  2. MACRO OPEN-APP $APP_URL
  3. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [DOM] a greeting ("Good ..." or the user's first name), four suggestion cards and the composer are visible.
  A2 [NET] exactly one `POST .../service/session`, one `GET .../service/suggestions` and one `GET .../service/tool-call-logs`; no forwarded URL contains `userEmail`.
  A3 [CONSOLE] no error-level message from app code.
- Cleanup: delete the created session (see `E2E-P-05`).
- Evidence: snapshot-final.txt, screenshot-final.png, network.json, console.txt
- Status: NOT RUN

### E2E-P-02 - Send a message, the reply streams to completion
- Spec: p-mc-app-chat-surface / conversation and composer
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 180
- Pre: `E2E-P-01` state.
- Steps:
  1. MACRO SEND text="e2e-hello: reply with one short sentence"
  2. MACRO WAIT-STREAM-DONE timeoutMs=90000
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM}
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [DOM] a user bubble appears, the assistant bubble grows, the typing indicator is gone and the composer is enabled within 90 s; no error banner.
  A2 [NET] the stream request answered 200 with `text/event-stream`; the forwarded URL has only the `locale` query.
  A3 [CONSOLE] no error-level message.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json
- Status: NOT RUN

### E2E-P-03 - A tool part appears
- Spec: p-mc-app-chat-surface / tool steps
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: tool-call-log mode `tools` or `all` (set it as user A with `E2E-G-08`/`E2E-Q-06` if hidden). Uses the public documentation MCP, so no identity connection is needed.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-tool: search the commercetools docs for \"custom objects\" and summarise in two lines"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [DOM] a tool-steps pill ("Checked N sources") or a tool block appears.
  A2 [NET] the stream completes without an `error` chunk.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-P-04 - Sessions list and title
- Spec: p-mc-app-chat-surface / Chats drawer, digest title
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: none.
- Steps:
  1. mcp__chrome-devtools__take_snapshot {pageId: $P}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the rail item "Chats">}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P}
  4. MACRO NEW-CHAT
  5. MACRO SEND text="e2e-title: hi"
  6. MACRO WAIT-STREAM-DONE timeoutMs=120000
  7. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Chats"], timeout: 12000}
  8. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-P-04/snapshot-final.txt"}
- Assert:
  A1 [DOM] the Chats drawer lists the current session and the order is newest first.
  A2 [DOM] up to 10 s after the turn the session title is not "New chat" (digest, see `E2E-G-03`).
  A3 [CONSOLE] no error-level message.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-P-05 - Delete a session
- Spec: p-mc-app-chat-surface / delete with confirmation, next session from the refreshed list
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: at least two `e2e-` sessions; the one to delete is open.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the rail item "Chats">}
  2. mcp__chrome-devtools__hover {pageId: $P, uid: <uid of the e2e session row>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Delete chat">}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Cancel in the dialog>}
  6. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Delete chat">}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Confirm in the dialog>}
  9. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-P-05/snapshot-final.txt"}
- Assert:
  A1 [NET] after Cancel (step 6) no `DELETE .../session/<id>` request exists.
  A2 [NET] after Confirm `DELETE .../session/<id>` answered 200.
  A3 [DOM] the row is gone; when it was the open session the app shows another session or a new empty one.
- Cleanup: none.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-P-06 - Reload restores the session
- Spec: p-mc-app-chat-surface / session persistence in the browser
- Tags: smoke, needs:M8
- Env: both
- Budget: 180
- Pre: a session with at least one message.
- Steps:
  1. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({id: localStorage.getItem('chat-session-id'), first: document.body.innerText.includes('e2e-')})"}
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  3. mcp__chrome-devtools__wait_for {pageId: $P, text: ["e2e-"], timeout: 60000}
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => localStorage.getItem('chat-session-id')"}
- Assert:
  A1 [DOM] the same first user message text is present after the reload.
  A2 [DOM] `localStorage['chat-session-id']` is unchanged.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-P-07 - Tool toggles are saved, discarded on close
- Spec: p-mc-app-chat-surface / tools panel
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: a session with one message (see `E2E-G-05` for the service side).
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  2. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of "Filter tools">, value: "order"}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of one tool switch>}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Save>}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  7. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-P-07/snapshot-reopened.txt"}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the same tool switch>}
  9. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the close control, not Save>}
  10. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
- Assert:
  A1 [NET] step 4 sent `PUT .../session/<id>/tools` answering 200.
  A2 [DOM] after the reload the tool is still off; after toggling on and closing without Save it is still off and no second PUT was sent.
- Cleanup: toggle the tool on and Save; delete the session.
- Evidence: snapshot-reopened.txt, network.json
- Status: NOT RUN

### E2E-P-08 - Follow-up chips
- Spec: p-mc-app-chat-surface / follow-up chips from the digest
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: none.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-chips: explain what a cart discount is in two sentences"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Chats"], timeout: 10000}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of one follow-up chip>}
  7. mcp__chrome-devtools__take_snapshot {pageId: $P}
  8. MACRO NEW-CHAT
- Assert:
  A1 [DOM] within 8 s of the finished turn up to three chips are shown (soft: the digest may be late, see `E2E-G-03`).
  A2 [DOM] clicking a chip sends its text as a new user message and the chips disappear.
  A3 [DOM] switching to another session clears the chips.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-P-09 - Feedback popup
- Spec: p-mc-app-chat-surface / feedback submit
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: a completed turn.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the thumbs-down under the last reply>}
  2. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of "What went wrong">, value: "e2e-feedback"}
  3. mcp__chrome-devtools__emulate {pageId: $P, networkConditions: "Offline"}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the submit button>}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P}
  6. mcp__chrome-devtools__emulate {pageId: $P, networkConditions: "No emulation"}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the submit button>}
  8. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [DOM] offline: the popup stays open and keeps the typed comment.
  A2 [NET] online: `POST .../service/feedback/submit` answers 201 and the popup closes.
  A3 [CONSOLE] no uncaught exception.
- Cleanup: remove the feedback with `cleanup.mjs --run $RUN`; delete the session; reset the network emulation.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-P-10 - Chart renders
- Spec: p-mc-app-chat-surface / visualisation part
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: none.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-chart: show a bar chart of 3 made-up categories with values 1,2,3"
  3. MACRO WAIT-STREAM-DONE timeoutMs=240000
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({svg: document.querySelectorAll('svg').length, charts: document.querySelectorAll('[class*=chart], [data-ct-component*=hart]').length})"}
  5. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error"]}
- Assert:
  A1 [DOM] soft: a chart container (svg or chart element) or a `visualize_data` tool block is in the transcript, or a graceful text answer exists.
  A2 [CONSOLE] no uncaught exception from the chart renderer.
  A3 [NET] the stream completes without an `error` chunk.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, screenshot-final.png, console.txt
- Status: NOT RUN

### E2E-P-11 - Preview, code, save page, pages route
- Spec: p-mc-app-chat-surface / composed page panel and `/composed/:pageKey`
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 600
- Pre: Nimbus embedded (`E2E-K-01`).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-page: build a simple page with a heading and a button"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Code view of the Assistant/Preview/Code switcher>}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. MACRO SEND text="e2e-page2: save this page as e2e-page"
  8. MACRO WAIT-STREAM-DONE timeoutMs=300000
  9. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the rail item "Pages">}
  10. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the row e2e-page>}
  11. mcp__chrome-devtools__take_snapshot {pageId: $P}
  12. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Page settings">}
  13. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Delete page">}
  14. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the confirm button>}
- Assert:
  A1 [DOM] the Assistant/Preview/Code switcher appears, Preview renders text, Code shows source.
  A2 [DOM] after saving the Pages rail count increases; opening the row navigates to a URL containing `/composed/` and renders the page.
  A3 [CO] the object exists in `shared-composed-pages` before the delete and is gone after step 14.
  A4 [CONSOLE] no error-level message from app code.
- Cleanup: the page is deleted in step 14; delete the session.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-P-12 - Annotations
- Spec: p-mc-app-chat-surface / preview annotations (`data-ct-annotations`)
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: a preview from `E2E-P-11` steps 1 to 4. The server side is `E2E-H-08`.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Start feedback mode">}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the heading in the preview>}
  3. mcp__chrome-devtools__type_text {pageId: $P, text: "e2e-note"}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the annotation Send button>}
  5. MACRO WAIT-STREAM-DONE timeoutMs=240000
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Details sent to the assistant">}
  8. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [DOM] a new user message lists the annotation and a collapsed "Details sent to the assistant"; expanding it shows JSON containing `componentNames`.
  A2 [NET] the stream request body contains a part of type `data-ct-annotations`.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-P-13 - Stale session recovery
- Spec: p-mc-app-chat-surface / session context recovery
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 120
- Pre: none.
- Steps:
  1. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => { localStorage.setItem('chat-session-id', '00000000-0000-0000-0000-000000000000'); return true; }"}
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  3. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…"], timeout: 60000}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [NET] exactly one `GET .../session/00000000-.../messages` answering 404, followed by `GET .../service/session` (last) or `POST .../service/session`.
  A2 [DOM] no error banner and no request loop (the 404 count is 1).
- Cleanup: delete the session that was created.
- Evidence: network.json, snapshot-final.txt
- Status: NOT RUN

### E2E-P-14 - Attachments
- Spec: p-mc-app-chat-surface / attach button
- Tags: regression, negative, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: a small text file `$TMPDIR/e2e.txt` created by the agent (content `e2e attachment`) and an empty file `$TMPDIR/e2e.exe`.
- Steps:
  1. MACRO NEW-CHAT
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__upload_file {pageId: $P, uid: <uid of the attach button input>, filePaths: ["$TMPDIR/e2e.txt"]}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. MACRO SEND text="e2e-attach: what does the attached file say"
  6. MACRO WAIT-STREAM-DONE timeoutMs=180000
  7. mcp__chrome-devtools__upload_file {pageId: $P, uid: <uid of the attach button input>, filePaths: ["$TMPDIR/e2e.exe"]}
  8. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [DOM] a chip with the file name appears after step 3 and is cleared after the send completes.
  A2 [NET] the stream completes without an `error` chunk.
  A3 [DOM] the `.exe` is not added (no chip).
- Cleanup: delete the session and the temporary files.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-P-15 - Private image displays through the backend
- Spec: p-mc-app-chat-surface / private images (`blob:` URL, "Image unavailable" with Retry)
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: change L deployed with a valid service account key and `IMAGE_URL_MODE=private` (default). The server side is `E2E-L-04`.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-image: generate a small picture of a red square"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => [...document.querySelectorAll('img')].map(i => ({src: i.src.slice(0, 12), w: i.naturalWidth}))"}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  6. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  7. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL"}
  8. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error"]}
- Assert:
  A1 [DOM] a transcript `<img>` has `naturalWidth > 0` and a `src` starting with `blob:`; it renders again after the reload.
  A2 [NET] `GET .../service/files/<sid>/<file>` answered 200 with `cache-control: private, no-store`; no request from the page to `storage.googleapis.com`.
  A3 [CONSOLE] switching to another session and back produces no errors.
  A4 [DOM] negative: with the files request blocked (use `emulate` `Offline` for the reload of the transcript) the placeholder "Image unavailable" with a Retry button is shown; after restoring the network and clicking Retry the image shows.
- Cleanup: delete the session; reset the emulation.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json
- Status: NOT RUN

### E2E-P-16 - Own user id is shown, and becoming an administrator
- Spec: p-mc-app-chat-surface / "Your user ID" line
- Tags: regression, destructive, needs:M8, needs:second-user, needs:deployment
- Env: both
- Budget: 600
- Pre: users A and B attached; `E2E_ALLOW_DESTRUCTIVE=1` for the second part. The full bootstrap procedure with the empty list is `E2E-V-13`.
- Steps:
  1. mcp__chrome-devtools__take_snapshot {pageId: $P}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the avatar or "Account" in the rail>}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-P-16/snapshot-menu.txt"}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Copy">}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P}
  6. SHELL: `node scripts/connect/connect.mjs configure ADMIN_USER_IDS=<id of A>,<id of B>` (local: restart the service with the value)
  7. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  8. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [DOM] as each user the line "Your user ID" is present; its value equals `data.userId` of the user's own bootstrap response; there is no `input` element in the popover.
  A2 [DOM] after Copy the button text becomes "Copied" and no new `forward-to` request was sent.
  A3 [NET] after step 6 and a reload as user B the bootstrap has `isAdmin: true` and the admin surfaces (see Q) appear; the comma-separated list arrived as two ids.
- Cleanup: restore the previous `ADMIN_USER_IDS` value (A only).
- Evidence: snapshot-menu.txt, screenshot-final.png (ids replaced by placeholders)
- Status: NOT RUN

## Coverage

- First load, send, tools, sessions, delete, reload, toggles, chips, feedback, charts, pages, annotations, recovery, attachments, images, user id: `E2E-P-01` to `E2E-P-16`.
- Not covered by a card: motion and animation details, Gravatar loading, the streaming retry banner (needs a failing stream; `E2E-H-07` covers the error line).
