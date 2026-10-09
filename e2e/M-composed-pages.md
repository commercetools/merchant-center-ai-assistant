# Playbook M: composed pages (`create_composed_page`)

Owning change: `m-composed-pages` (ids `E2E-M-01` to `E2E-M-06` are defined in its `tasks.md` 7.2).
The assistant's `create_composed_page` tool validates and transpiles a page (schema version `5.0`,
Babel on the server) and returns a result with a URI `ui://composed-page/<key>/v<n>`; the page is
saved by the frontend into the Custom Object container `shared-composed-pages` (the service does not
write it). Cards run in `mc-app`; the Preview/Code switcher and `Save Page` are described in
`E2E-P-11`.

### E2E-M-01 - A dashboard request renders a composed page part
- Spec: m-composed-pages / tool result and URI
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: tool-call-log mode `all` or `tools`; Nimbus embedded (`E2E-K-01`).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-m01: build a small dashboard page with a heading and the number of orders"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-M-01/stream.txt"}
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] `stream.txt` has a `create_composed_page` tool output with `success: true` and a `ui://composed-page/<key>/v1` URI.
  A2 [DOM] the Assistant/Preview/Code switcher appears and Preview renders text.
  A3 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-M-02 - A change request creates version 2 of the same page
- Spec: m-composed-pages / versioned URI (`previousVersion`)
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: `E2E-M-01` in the same session.
- Steps:
  1. MACRO SEND text="e2e-m02: change the heading of that page to say Hello"
  2. MACRO WAIT-STREAM-DONE timeoutMs=300000
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-M-02/stream.txt"}
- Assert:
  A1 [NET] the new `create_composed_page` output URI ends with `/v2` and has the same key as in `E2E-M-01`.
  A2 [DOM] the preview shows the updated page.
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-M-03 - A page with hooks renders from the server-transpiled code
- Spec: m-composed-pages / server transpile, client uses `transpiledCode`
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: none.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-m03: build a page with a counter button that increases a number when clicked (use state)"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the counter button in the preview>}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P}
  7. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
- Assert:
  A1 [DOM] the number changes after the click (a stateful component renders).
  A2 [NET] the tool output holds a `transpiledCode` field (base64) in its schema components.
  A3 [CONSOLE] no error; once `mc-app` adopts the server code the console shows no client-side re-transpile message (record what is shown; if the client still transpiles, note it as an open item of change P/M task 6.2).
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt, console.txt
- Status: NOT RUN

### E2E-M-04 - Forbidden code is rejected and the assistant retries
- Spec: m-composed-pages / validator (no `window`, no network, read-only GraphQL)
- Tags: regression, negative, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: none.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-m04: build a page that shows window.location.href in a heading"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-M-04/stream.txt"}
- Assert:
  A1 [NET] `stream.txt` contains a `create_composed_page` output with `success: false` and a list of `{path, message}` errors naming the forbidden global (when the model complies on the first try the card records SKIPPED(model did not attempt it)).
  A2 [NET] a later `create_composed_page` call in the same turn succeeds without `window` (soft) or the assistant explains the limit.
  A3 [CO] no object was created for a rejected page (`co.mjs list --prefix shared-composed-pages` unchanged by this card).
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-M-05 - Saving a page writes a Custom Object
- Spec: m-composed-pages / stored value schema 5.0 in `shared-composed-pages`
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: `E2E-M-01` session with a page.
- Steps:
  1. MACRO SEND text="e2e-m05: save this page as e2e-m05-page"
  2. MACRO WAIT-STREAM-DONE timeoutMs=300000
  3. mcp__chrome-devtools__take_snapshot {pageId: $P}
  4. SHELL: `node scripts/e2e/co.mjs shape shared-composed-pages`
  5. SHELL: `node scripts/e2e/co.mjs list --container shared-composed-pages --prefix e2e-`
- Assert:
  A1 [DOM] the Pages rail count increases (see `E2E-P-11`).
  A2 [CO] an object whose key starts with `e2e-` exists in container `shared-composed-pages` and its value has `schema.version == "5.0"`, `name`, `isPublished` and components with base64 `code.text` and `code.transpiledCode`.
- Cleanup: delete the page in the app (Page settings, Delete page) or `node scripts/e2e/cleanup.mjs --run $RUN`.
- Evidence: shape.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-M-06 - A custom-view session has no composed-page tool
- Spec: m-composed-pages / tool exclusion for custom view
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: panel reachable at `$HOST_PAGE_URL`.
- Steps:
  1. MACRO OPEN-APP $HOST_PAGE_URL
  2. MACRO SEND text="e2e-m06: build me a page with a table of products"
  3. MACRO WAIT-STREAM-DONE timeoutMs=240000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-M-06/stream.txt"}
- Assert:
  A1 [NET] `stream.txt` contains no `create_composed_page` tool part; the panel session's tool list has no `commercetoolsUI` group.
  A2 [NET] the stream completes without an `error` chunk (the assistant answers in text).
- Cleanup: delete the session.
- Evidence: stream.txt, snapshot-final.txt
- Status: NOT RUN

## Coverage

- Tool result and versions: `E2E-M-01`, `E2E-M-02`; transpile and renderer: `E2E-M-03`, `E2E-P-11`; validator: `E2E-M-04`; storage and schema: `E2E-M-05`; custom-view exclusion: `E2E-M-06`; the pages app: `E2E-R-01` to `E2E-R-09`.
- Not covered: the 20 000 character caps and AST validation rules in detail (wire tests), the shared contract fixture (`contract/composed-page.fixture.json`, checked by `cd service && npm test`).
