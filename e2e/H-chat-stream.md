# Playbook H: agents and the chat stream

Owning change: `h-agents-and-chat-stream` (ids `E2E-H-01` to `E2E-H-08` are defined in its
`tasks.md`; the V design had reserved other meanings for H-02, H-03 and H-06 and those lose). The
stream is `POST /service/ai-chat/:sessionId/message/stream`, an AI SDK UI message stream (server-sent
events). The service writes a transient `data-keepalive` part every 20 s while idle, and when the
hard deadline ends a turn it appends the notice text "The time limit for a single reply was reached,
so this answer may be incomplete. Ask me to continue." and a persisted `data-turn-status` part before
a normal finish. Budget variables: `CHAT_REQUEST_BUDGET_MS` (at most 285000) and
`CHAT_FINALIZE_RESERVE_MS`.

Common step for streaming cards: after `SEND`, read the stream request with
`list_network_requests` (resource type `fetch`) and `get_network_request {responseFilePath}` to
inspect the frame sequence; for a long stream the response file is read after the stream ended.

### E2E-H-01 - A message streams a reply and the composer re-enables
- Spec: h-agents-and-chat-stream / chat stream endpoint
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 180
- Pre: `E2E-V-01` passed; `E2E-F-01` passed.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO NEW-CHAT
  3. MACRO SEND text="e2e-h01: reply with one short sentence"
  4. MACRO WAIT-STREAM-DONE timeoutMs=120000
  5. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-H-01/stream.txt"}
  6. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the stream request answers 200 with `content-type` containing `text/event-stream`; the URL has no `userEmail` and the request body carries the messages, not an e-mail.
  A2 [NET] the saved frames start with a `start` chunk, contain `text-delta` chunks and end with a `finish` chunk; there is no `error` chunk.
  A3 [DOM] one user bubble and one assistant bubble with text; the composer textbox is enabled again.
  A4 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt, screenshot-final.png, network.json, console.txt
- Status: NOT RUN

### E2E-H-02 - A tool part renders (visualisation or entity link)
- Spec: h-agents-and-chat-stream / tools `visualize_data`, `create_entity_link`, `export_data`
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: tool-call-log mode `all` or `tools` so that tool parts are shown (set by `E2E-G-08`/`E2E-Q-06` if needed).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-h02: show a bar chart of 3 made-up categories with values 1, 2 and 3"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. MACRO SEND text="e2e-h02b: give me a link to the order with id 00000000-0000-0000-0000-000000000000"
  5. MACRO WAIT-STREAM-DONE timeoutMs=180000
  6. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-H-02/stream-2.txt"}
  7. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] both streams complete with `finish` and no `error` chunk.
  A2 [DOM] soft: after the first turn a chart (an `svg` or chart container) or a `visualize_data` tool block is in the transcript; after the second a link whose URL path contains `/orders/` appears (entity link) or a graceful text answer. Assert structure only (a tool part of type `tool-visualize_data` or `tool-create_entity_link` in `stream.txt`).
  A3 [CONSOLE] no uncaught exception from the chart renderer.
- Cleanup: delete the session.
- Evidence: stream-1.txt, stream-2.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-H-03 - A second message uses the history
- Spec: h-agents-and-chat-stream / history window and normalisation
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: none.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-h03: my favourite number is 7394"
  3. MACRO WAIT-STREAM-DONE timeoutMs=120000
  4. MACRO SEND text="e2e-h03b: repeat my first message exactly"
  5. MACRO WAIT-STREAM-DONE timeoutMs=120000
  6. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the second request body has at least three messages (history sent) and the stream completes without an `error` chunk.
  A2 [DOM] soft: the second reply contains `7394` (one retry in a new session on a miss).
  A3 [NET] `GET .../session/<id>/messages` returns four messages in order.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-H-04 - Time budget: graceful end locally, a 4-minute turn on the sandbox
- Spec: h-agents-and-chat-stream / request budget guard (OQ-H2)
- Tags: slow, destructive, needs:M8, needs:service-account
- Env: both (local with a reduced budget, sandbox with a real long turn)
- Budget: 600
- Pre: local: restart the service with `CHAT_REQUEST_BUDGET_MS=40000 CHAT_FINALIZE_RESERVE_MS=10000` (SERVICE-RESTART macro with those variables set in `.env.local`); sandbox: the default budget (285000); `E2E_ALLOW_DESTRUCTIVE=1` for the restart.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO NEW-CHAT
  3. MACRO SEND text="e2e-h04: research six different topics in the commercetools documentation one after another, searching for each separately, and write one paragraph per topic"
  4. MACRO WAIT-STREAM-DONE timeoutMs=330000
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  6. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-H-04/stream.txt"}
  7. MACRO SEND text="e2e-after-budget: say OK"
  8. MACRO WAIT-STREAM-DONE timeoutMs=120000
- Assert:
  A1 [NET] local: the stream ends before 45 s after the request started with a normal `finish`; sandbox: the stream runs for about 4 minutes or ends at the budget, with no 502 or 504 and no connection reset (this settles OQ-H2).
  A2 [NET] when the hard deadline ended the turn (always local), `stream.txt` contains a `data-turn-status` part and the notice text containing "time limit for a single reply".
  A3 [DOM] the notice is visible in the last assistant message and the composer is enabled.
  A4 [NET] `GET .../messages` returns the assistant message with the same text and notice (it was persisted).
  A5 [NET] the follow-up in step 7 completes (the session is usable after a budget end).
  A6 [NET] `data-keepalive` parts appear about every 20 s while the model is idle (soft).
- Cleanup: restore the default budget variables and restart the local service; delete the session.
- Evidence: stream.txt, timing.json (request start, first byte, end), snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-H-05 - Aborting a turn stops the work
- Spec: h-agents-and-chat-stream / client disconnect aborts the run
- Tags: regression, negative, needs:M8, needs:service-account
- Env: local (the service log is needed)
- Budget: 240
- Pre: the composer in `mc-app` has no Stop button at the time of writing (checked in `mc-app/src/components/new-chat/composer`); the abort is produced by leaving the page. If a Stop control is added later, use it instead and keep A1 to A3.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-h05: research four topics in the documentation one after another"
  3. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Checked"], timeout: 30000}
  4. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], includePreservedRequests: true, pageSize: 50}
  6. SHELL: `grep -c "chat turn finished" .e2e-service.log; tail -n 30 .e2e-service.log`
- Assert:
  A1 [NET] the first stream request is listed as cancelled or failed (not 200 complete) after the reload.
  A2 [SHELL] the service log shows the turn ended by abort (field of the `chat turn finished` line says aborted) within a few seconds and no further tool calls afterwards.
  A3 [CONSOLE] no error-level message in the new page load.
  A4 [NET] the reloaded session still shows the user message; sending a new message works.
- Cleanup: delete the session.
- Evidence: network.json, service-log-excerpt.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-H-06 - A custom-view session answers in entity context
- Spec: h-agents-and-chat-stream / custom-view orchestrator
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: change S panel on a product page `$HOST_PAGE_URL`.
- Steps:
  1. MACRO OPEN-APP $HOST_PAGE_URL
  2. MACRO SEND text="e2e-h06: what is the name of the product I am looking at"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the stream URL carries `customView`; the stream completes, no `error` chunk.
  A2 [DOM] structural: an assistant message exists; soft: it mentions the product shown on the page.
  A3 [NET] the panel session is only in the flagged list (`E2E-G-07`).
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-H-07 - A provider error renders as one line
- Spec: h-agents-and-chat-stream / error part, no schema dump
- Tags: regression, negative, needs:M8
- Env: local
- Budget: 240
- Pre: the service runs with an invalid `GEMINI_MODEL_NAME` or the `GCP_SA_KEY_BASE64` of a key without the Vertex role, so that the model call fails after the request is accepted (not a startup failure); record which variant was used.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-h07: hi"
  3. mcp__chrome-devtools__wait_for {pageId: $P, text: ["went wrong", "error", "Try again"], timeout: 60000}
  4. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the stream carries an `error` chunk or a non-2xx status with a short message.
  A2 [DOM] the UI shows a one-line error with a retry affordance (aria-label "Try again"), not a JSON or validation dump, not a stack.
  A3 [NET] the error text contains no key, token or full request body.
- Cleanup: restore the service configuration; delete the session.
- Evidence: stream.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-H-08 - Preview annotations reach the model
- Spec: h-agents-and-chat-stream / annotation part conversion (`data-ct-annotations`)
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: a composed page preview exists in the open session (`E2E-P-11` steps 1 to 3).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-h08: build a simple page with a heading and a button"
  3. MACRO WAIT-STREAM-DONE timeoutMs=240000
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Start feedback mode">}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the page heading in the preview>}
  7. mcp__chrome-devtools__type_text {pageId: $P, text: "e2e-note"}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the annotation Send button>}
  9. MACRO WAIT-STREAM-DONE timeoutMs=240000
  10. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, requestFilePath: "$TMPDIR/e2e/$RUN/E2E-H-08/request.json"}
- Assert:
  A1 [NET] the request body contains a part of type `data-ct-annotations` with a comment `e2e-note` and component names.
  A2 [NET] the stream completes without an `error` chunk (the part was converted to text for the model, not rejected).
  A3 [DOM] the user message shows the annotation list and a collapsed "Details sent to the assistant".
- Cleanup: delete the session and the unsaved page.
- Evidence: request.json (truncated), snapshot-final.txt
- Status: NOT RUN

## Coverage

- Stream protocol, history, tools, budget, abort, error rendering, annotations, custom view: `E2E-H-01` to `E2E-H-08`; `E2E-V-06` repeats the budget behaviour as a cross-cutting card.
- Not covered by a browser card: the eight functional agents each (their sources have cards in J, K, L, M), tool-schema normalisation (wire tests, run by `E2E-V-08`), image generation (`E2E-L-04`).
