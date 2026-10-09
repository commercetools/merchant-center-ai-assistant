# Playbook L: BigQuery offload and GCS images

Owning change: `l-bigquery-and-gcs` (ids `E2E-L-01` to `E2E-L-08` are defined in its `tasks.md`; the
V design had reserved different meanings for L-03 to L-05 and those lose). Large tool results are
offloaded into per-session BigQuery tables (7-day expiry) and queried with `query_aggregated_data`
(read-only SQL guard, dry-run, `maximumBytesBilled` cap, 500-row cap). Images are stored privately in
a bucket and read back through `GET /service/files/<sessionId>/<file>` (default
`IMAGE_URL_MODE=private`, no signed URLs). The frontend loads them with the forwarding fetch into a
`blob:` URL. All cards need the GCP service account (manual step M5) and a Vertex model.

### E2E-L-01 - Aggregated question: read tool then `query_aggregated_data`
- Spec: l-bigquery-and-gcs / offload and aggregated query
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: tool-call-log mode `all`; the identity MCP is connected (`E2E-I-03`) so commercetools read tools exist; the scratch project has orders (any count).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-l01: How many orders per status in the last 30 days?"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-L-01/stream.txt"}
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] `stream.txt` has a commercetools read tool part followed by a `query_aggregated_data` tool part whose output has `success: true` and a `rowCount`.
  A2 [NET] the stream completes without an `error` chunk.
  A3 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session (also removes the temporary tables, see `E2E-L-07`).
- Evidence: stream.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-L-02 - The SQL guard refuses writes
- Spec: l-bigquery-and-gcs / read-only SQL guard
- Tags: regression, negative, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: `E2E-L-01` ran in the same session (a temporary table reference is in the transcript).
- Steps:
  1. MACRO SEND text="e2e-l02: run this SQL exactly: DELETE FROM `<table reference shown in the previous answer>` WHERE TRUE"
  2. MACRO WAIT-STREAM-DONE timeoutMs=240000
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-L-02/stream.txt"}
  4. MACRO SEND text="e2e-l02b: count the rows in that table"
  5. MACRO WAIT-STREAM-DONE timeoutMs=240000
- Assert:
  A1 [NET] the `query_aggregated_data` part of step 1 has `success: false` with a guard message (statement type not allowed), or the model declines without calling the tool.
  A2 [NET] after step 4 the table is still queryable and returns the same row count as before (no write happened).
  A3 [NET] no stream has an `error` chunk.
- Cleanup: delete the session.
- Evidence: stream-1.txt, stream-2.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-L-03 - Export neutralises spreadsheet formulas
- Spec: l-bigquery-and-gcs / export hardening
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: none.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-l03: export these 3 rows as a CSV file: name,qty / =HYPERLINK(\"http://x\",\"y\"),1 / b,2 / c,3"
  3. MACRO WAIT-STREAM-DONE timeoutMs=240000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-L-03/stream.txt"}
  5. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => { const a = [...document.querySelectorAll('a[download], a[href^=\"data:\"]')].map(x => ({download: x.getAttribute('download'), href: x.getAttribute('href') && x.getAttribute('href').slice(0, 40)})); return a; }"}
- Assert:
  A1 [DOM] an export part (file chip or download link) is in the transcript; its file name ends with `.csv`.
  A2 [NET] in `stream.txt` the export tool output decodes (base64) to CSV in which the formula cell starts with `'=` (neutralised), not `=`; decode in a SHELL step with `base64 -d`.
  A3 [CONSOLE] no error-level message.
- Cleanup: delete the session.
- Evidence: stream.txt, export-decoded.csv (three rows, no personal data), snapshot-final.txt
- Status: NOT RUN

### E2E-L-04 - Image generation displays through the backend (private mode)
- Spec: l-bigquery-and-gcs / private image delivery (default `IMAGE_URL_MODE=private`)
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: the bucket exists or can be created by the service account; the image model is available in the region (`E2E-F-01` passed).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-l04: generate a small picture of a red square"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => [...document.querySelectorAll('img')].map(i => ({src: i.src.slice(0, 12), w: i.naturalWidth})).filter(i => i.src.startsWith('blob:') || i.w > 64)"}
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  6. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of the request whose x-forward-to ends /service/files/<sessionId>/<file>>}
  7. MACRO REPLAY-FORWARD GET /session/<sessionId>/messages null null
- Assert:
  A1 [DOM] an `<img>` in the transcript has `naturalWidth > 0` and a `src` starting with `blob:`.
  A2 [NET] `GET .../service/files/<sessionId>/<file>` answered 200 with `content-type` starting `image/` and `cache-control: private, no-store`.
  A3 [NET] no request from the page to `storage.googleapis.com`.
  A4 [NET] the stored message part holds the relative `/files/...` URL and no bucket host.
  A5 [CONSOLE] no error-level message.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json (no image bytes)
- Status: NOT RUN

### E2E-L-05 - Image follow-up edit
- Spec: l-bigquery-and-gcs / image part reading for multi-turn edits
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 480
- Pre: `E2E-L-04` in the same session.
- Steps:
  1. MACRO SEND text="e2e-l05: make it blue"
  2. MACRO WAIT-STREAM-DONE timeoutMs=300000
  3. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => [...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).map(i => i.naturalWidth)"}
  4. SHELL: `grep -ci "storage.googleapis.com" .e2e-service.log; grep -i "sharp" .e2e-service.log | tail -5`
- Assert:
  A1 [DOM] a second image is displayed (two blob images with width above 0).
  A2 [CONSOLE] no error-level message.
  A3 [SHELL] the service log shows no failed request to the storage host and no `sharp` load error (if `sharp` failed the app still works without downscaling; record it).
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, service-log-excerpt.txt
- Status: NOT RUN

### E2E-L-06 - Reloading the session shows the image again
- Spec: l-bigquery-and-gcs / stored relative file URL
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: `E2E-L-04` session exists.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["e2e-l04"], timeout: 60000}
  3. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => [...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).map(i => i.naturalWidth)"}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
- Assert:
  A1 [DOM] the image renders again with a new `blob:` URL.
  A2 [NET] a new `GET .../files/...` answered 200.
  A3 [CONSOLE] no failed request for a stale `blob:` URL.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-L-07 - Deleting the session removes its tables and images
- Spec: l-bigquery-and-gcs / cleanup hook on session delete
- Tags: regression, shell, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: a session with a temporary table (`E2E-L-01`) and an image (`E2E-L-04`). The helper `service/scripts/check-gcp-cleanup.mjs` named in change L's tasks does not exist in the repository (see the notes of change L); when it is still missing this card is recorded as SKIPPED(script missing) after the UI part, or the agent checks the GCP console by hand.
- Steps:
  1. MACRO RECORD-SESSION
  2. MACRO REPLAY-FORWARD DELETE /session/<sessionId> null null
  3. SHELL: `node service/scripts/check-gcp-cleanup.mjs <sessionId>`
- Assert:
  A1 [NET] the delete answers 200.
  A2 [SHELL] the helper prints `tables: 0, images: 0`.
- Cleanup: none.
- Evidence: gcp-cleanup.txt
- Status: NOT RUN

### E2E-L-08 - Image privacy
- Spec: l-bigquery-and-gcs / no public bucket access, owner-only reads
- Tags: regression, negative, needs:M8, needs:second-user, needs:service-account
- Env: both
- Budget: 360
- Pre: an image from `E2E-L-04` (session id and file name known); bucket name from the deployment configuration.
- Steps:
  1. SHELL: `curl -s -o /dev/null -w "%{http_code}" "https://storage.googleapis.com/<bucket>/images/<sessionId>/<file>"` (a page `fetch` would be blocked by the app's content security policy, so the unauthenticated request is made from the shell)
  2. SHELL: `curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/service/files/<sessionId>/<file>"`
  3. MACRO CAPTURE-FORWARD
  4. MACRO REPLAY-FORWARD GET /files/<sessionId>/<file> null null
- Assert:
  A1 [SHELL] step 1 answers 403 or 401 (the object is not public).
  A2 [SHELL] step 2 answers 401 (no token).
  A3 [NET] step 4 as user B (on `chrome-devtools-b`, after step 3) answers 404; as user A it answers 200 `image/*`.
- Cleanup: delete the session.
- Evidence: privacy.json
- Status: NOT RUN

## Coverage

- Offload and aggregated query: `E2E-L-01`; SQL guard: `E2E-L-02`; export: `E2E-L-03`; private images: `E2E-L-04` to `E2E-L-06`, `E2E-L-08`, `E2E-P-15`; cleanup: `E2E-L-07`.
- Not covered: the load-job fallback for projects without billing, the 7-day table expiry, the 10 MB body measurement through the gateway (OQ-L7), `IMAGE_URL_MODE=public` (opt-in).
