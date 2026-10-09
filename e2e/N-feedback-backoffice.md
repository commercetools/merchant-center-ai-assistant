# Playbook N: feedback and backoffice API

Owning change: `n-feedback-and-backoffice-api` (ids `E2E-N-01` to `E2E-N-06` are defined in its
`tasks.md`; the V design's N-03 and N-04 meanings moved). Routes: `POST /service/feedback/submit`
(any verified member, ownership checked), `GET /service/feedback/fetch` and
`GET /service/feedback/fetch/:feedbackId` (administrator only), `GET /service/backoffice/is-admin`,
`POST /service/backoffice/threads` and `GET /service/backoffice/threads/:sessionId` (administrator
only). Snapshots are stored in chunks of 192 KiB with a sha256 and `snapshotIntact`; the body limit is
`10mb` and one snapshot is capped at 8 MiB. The backoffice shows a display-only `userLabel` marked
"(unverified)"; ownership and admin are decided by the verified user id.

### E2E-N-01 - Submit feedback from the chat and see it in the admin list
- Spec: n-feedback-and-backoffice-api / submit and list
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: a completed chat turn exists in the session (`E2E-H-01` steps); user A is an administrator.
- Steps:
  1. MACRO SEND text="e2e-n01: reply with one short sentence"
  2. MACRO WAIT-STREAM-DONE timeoutMs=120000
  3. mcp__chrome-devtools__take_snapshot {pageId: $P}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the thumbs-down button under the last reply>}
  5. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of "What went wrong">, value: "e2e-feedback-n01"}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the submit button of the popup>}
  7. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the "Feedback" tab>}
  9. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-N-01/snapshot-final.txt"}
- Assert:
  A1 [NET] `POST .../service/feedback/submit` answers 201 with an id, `messageCount` and `snapshotSource`; the request body has a client snapshot of the messages and the comment, no e-mail and no user id.
  A2 [NET] `GET .../service/feedback/fetch` answers 200 and the list contains the entry (metadata only).
  A3 [DOM] the Feedback tab lists the new entry; the popup closed after the submit.
  A4 [CO] `co.mjs shape ai-assistant-feedback` has an object for it with the submitting user's `userId`.
- Cleanup: feedback has no delete endpoint; the object is removed by `node scripts/e2e/cleanup.mjs --run $RUN` (key and comment marker `e2e-`).
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-N-02 - Large snapshots: about 6 MiB accepted, about 11 MiB rejected readably
- Spec: n-feedback-and-backoffice-api / body limit and chunking (OQ-N2 measurement)
- Tags: slow, regression, negative, needs:M8
- Env: sandbox (the gateway limit on the real route is part of the measurement); local for the service part
- Budget: 600
- Pre: a session with a long transcript can be produced by pasting a large `e2e-` text (the composer accepts long input); the agent generates two payloads of about 6 MiB and 11 MiB through the replay macro instead (no model call): body `{sessionId, comment: "e2e-n02", messages: [<one message with a part of N bytes>]}`.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "async (n) => { const c = window.__e2eForward; const text = 'x'.repeat(n); const r = await fetch(c.url, {method: 'POST', credentials: 'include', cache: 'no-store', headers: {...c.headers, 'x-forward-to': '<SERVICE_URL>/service/feedback/submit', 'content-type': 'application/json'}, body: JSON.stringify({sessionId: '<sessionId>', comment: 'e2e-n02', messages: [{id: 'e2e-big', role: 'user', parts: [{type: 'text', text}]}]})}); const t = await r.text(); return {status: r.status, head: t.slice(0, 200)}; }", args: [6000000]}
  3. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "<same function>", args: [11000000]}
- Assert:
  A1 [NET] the 6 MB submit answers 201 and the stored snapshot is chunked (co.mjs shows several objects in `ai-assistant-feedback-snap-<id>`).
  A2 [NET] the 11 MB submit answers 413 (or 400) with a short readable message (not an HTML error page of the gateway); on the sandbox record which layer answered (service JSON or gateway) and the largest size that passes (OQ-N2).
  A3 [NET] the service stays up (`/service/status` answers 200 afterwards).
- Cleanup: `cleanup.mjs --run $RUN` (feedback objects with the `e2e-` comment marker); the generated payloads are never stored in evidence.
- Evidence: sizes.json (status and layer per size)
- Status: NOT RUN

### E2E-N-03 - Admin opens the detail: transcript reassembled and intact
- Spec: n-feedback-and-backoffice-api / detail with reassembly and `snapshotIntact`
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: feedback from `E2E-N-01`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the "Feedback" tab>}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the e2e entry row>}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-N-03/snapshot-final.txt"}
  6. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of GET .../feedback/fetch/<id>>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-N-03/detail.json"}
- Assert:
  A1 [NET] the detail answers 200 with the transcript and `snapshotIntact: true`.
  A2 [DOM] the detail view shows the user and assistant messages and the comment `e2e-feedback-n01`.
  A3 [CONSOLE] no error-level message.
- Cleanup: none.
- Evidence: detail.json (message text truncated), snapshot-final.txt
- Status: NOT RUN

### E2E-N-04 - Non-admin is refused, also with forged identity hints
- Spec: n-feedback-and-backoffice-api / requireAdmin, forged identity ignored
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 300
- Pre: user B attached on `chrome-devtools-b`.
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. MACRO CAPTURE-FORWARD
  3. MACRO REPLAY-FORWARD GET /backoffice/is-admin null null
  4. MACRO REPLAY-FORWARD GET /feedback/fetch null {"x-admin-email":"admin@example.invalid"}
  5. MACRO REPLAY-FORWARD GET /feedback/fetch?userEmail=admin@example.invalid null null
  6. MACRO REPLAY-FORWARD POST /backoffice/threads {"userEmail":"admin@example.invalid","userLabel":"e2e-forged"} null
  7. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  8. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [NET] step 3 answers 200 with false; steps 4, 5 and 6 answer 403 `code: "ADMIN_REQUIRED"`.
  A2 [DOM] the backoffice route shows "Administrator access required" and no tabs.
  A3 [NET] no request to `backoffice/threads` or `feedback/fetch` is made by the page itself after step 7.
- Cleanup: none.
- Evidence: replay-results.json, snapshot-final.txt
- Status: NOT RUN

### E2E-N-05 - Backoffice thread list and detail across two users
- Spec: n-feedback-and-backoffice-api / threads with filters, unverified label
- Tags: regression, needs:M8, needs:second-user
- Env: both
- Budget: 480
- Pre: user A and user B each have at least one `e2e-` session (create with `E2E-G-01` steps as each).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL/backoffice"}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P}
  4. mcp__chrome-devtools__fill {pageId: $P, uid: <uid of "Filter by user ID">, value: "<user-id-b>"}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-N-05/snapshot-filtered.txt"}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of a row>}
  7. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [NET] `POST .../backoffice/threads` answers 200 with sessions of both users; the filtered request body carries the user id filter and the result contains only user B's sessions.
  A2 [DOM] there is no "Project" column; labels carry the text "(unverified)" and are plain text, not links; clicking a row opens `/backoffice/<sessionId>` with the messages.
  A3 [NET] the detail answers 200 only for an administrator (`E2E-N-04` covers the refusal).
- Cleanup: delete both users' `e2e-` sessions.
- Evidence: snapshot-filtered.txt, network.json (ids scrubbed)
- Status: NOT RUN

### E2E-N-06 - A submit with no client messages stores the server transcript
- Spec: n-feedback-and-backoffice-api / server transcript fallback
- Tags: regression, needs:M8
- Env: both
- Budget: 300
- Pre: a session with a completed turn (record the session id with RECORD-SESSION).
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD POST /feedback/submit {"sessionId":"<sessionId>","comment":"e2e-n06"} null
  3. MACRO REPLAY-FORWARD GET /feedback/fetch null null
- Assert:
  A1 [NET] step 2 answers 201 with `snapshotSource` showing the server transcript; the listing contains the entry.
  A2 [CO] the stored snapshot holds the transcript read from the server (user and assistant messages of the session), `snapshotIntact: true`.
  A3 [NET] a submit for a session id of another user answers 404 (ownership by verified user id).
- Cleanup: `cleanup.mjs --run $RUN`.
- Evidence: replay-results.json
- Status: NOT RUN

## Coverage

- Submit and fetch: `E2E-N-01`, `E2E-N-03`, `E2E-N-06`; limits and chunking: `E2E-N-02`; admin gating and forged identity: `E2E-N-04`, `E2E-V-03`, `E2E-V-12`; backoffice: `E2E-N-05`, `E2E-Q-10` to `E2E-Q-13`; the UI feedback popup: `E2E-P-09`.
- Not covered: audit log lines (service log, wire tests), the newest-first ordering by `updatedAt` (change N question about `createdAt` order).
