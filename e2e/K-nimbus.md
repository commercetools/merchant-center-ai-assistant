# Playbook K: embedded Nimbus MCP

Owning change: `k-nimbus-mcp-embedded` (ids `E2E-K-01` to `E2E-K-04` are defined in its `tasks.md`;
the child-respawn card the V design had under K-02 is `E2E-K-05` here). The service starts the
pinned `@commercetools/nimbus-mcp` as one long-lived stdio child; readiness is
`GET /service/status/nimbus` (unauthenticated, 200 for `ok` or `disabled`, 503 otherwise; it reports
the nimbus-mcp version and the 7 tool names). `/service/status` never touches the child. Kill switch:
`NIMBUS_MCP_ENABLED=false`. The Nimbus tools are used by the UI agent of the composed-pages tool and
are not offered in custom-view sessions.

### E2E-K-01 - Nimbus readiness and the seven tools
- Spec: k-nimbus-mcp-embedded / readiness endpoint
- Tags: smoke, shell
- Env: both
- Budget: 120
- Pre: service running; no login needed.
- Steps:
  1. SHELL: `curl -si "$SERVICE_URL/service/status/nimbus"`
  2. SHELL: `sleep 20; curl -si "$SERVICE_URL/service/status/nimbus"`
  3. mcp__chrome-devtools__new_page {url: "$SERVICE_URL/service/status/nimbus"}
  4. mcp__chrome-devtools__list_pages {}
  5. mcp__chrome-devtools__take_snapshot {pageId: <new page id>}
  6. mcp__chrome-devtools__close_page {pageId: <new page id>}
- Assert:
  A1 [SHELL] both calls answer 200 with `status: "ok"`, a `nimbusMcp` version and 7 tools (names include `list_components`, `get_components`, `get_tokens`, `search_icons`, `search_docs`, `get_docs_page`, `migrate_from_uikit`).
  A2 [SHELL] the second call (after 20 s idle) is as fast or faster (child stays alive, one child only: `pgrep -fc nimbus-mcp` on a local run prints 1).
  A3 [DOM] the browser tab shows the same JSON.
- Cleanup: close the tab.
- Evidence: nimbus-status.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-K-02 - The UI agent looks components up before it builds a page
- Spec: k-nimbus-mcp-embedded / Nimbus tools in the tool set
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: tool-call-log mode `all` or `tools`; change M tool available.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-k02: build me a small page with a data table of orders"
  3. MACRO WAIT-STREAM-DONE timeoutMs=300000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-K-02/stream.txt"}
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the stream completes with a `finish` chunk and no `error` chunk.
  A2 [NET] in `stream.txt` a tool part named `get_components` or `list_components` occurs before the first `create_composed_page` tool part (soft on order, hard on completion).
  A3 [CONSOLE] no error-level message from app code.
- Cleanup: delete the session and any saved page `e2e-*`.
- Evidence: stream.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-K-03 - Non-UI questions do not touch Nimbus; custom-view sessions do not have the tools
- Spec: k-nimbus-mcp-embedded / tool exclusion for custom view
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 360
- Pre: panel reachable at `$HOST_PAGE_URL` (change S).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-k03: how many orders were placed yesterday"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-K-03/stream.txt"}
  5. MACRO OPEN-APP $HOST_PAGE_URL
  6. MACRO CAPTURE-FORWARD
  7. MACRO REPLAY-FORWARD GET /session/<panelSessionId>/tools?customView=product null null
- Assert:
  A1 [NET] `stream.txt` of the first turn has no tool part from the Nimbus tools.
  A2 [NET] the tools listing of the panel session contains none of the seven Nimbus tool names.
- Cleanup: delete both sessions.
- Evidence: stream.txt, tools.json
- Status: NOT RUN

### E2E-K-04 - Kill switch: pages are still created without Nimbus
- Spec: k-nimbus-mcp-embedded / `NIMBUS_MCP_ENABLED=false`
- Tags: regression, destructive, needs:M8, needs:service-account
- Env: local
- Budget: 480
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; restart the service with `NIMBUS_MCP_ENABLED=false` (SERVICE-RESTART macro).
- Steps:
  1. SHELL: `curl -si "$SERVICE_URL/service/status/nimbus"`
  2. MACRO NEW-CHAT
  3. MACRO SEND text="e2e-k04: build me a small page with a data table of orders"
  4. MACRO WAIT-STREAM-DONE timeoutMs=300000
  5. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-K-04/stream.txt"}
- Assert:
  A1 [SHELL] the readiness answers 200 with `status: "disabled"`.
  A2 [NET] the stream completes and contains `create_composed_page` without any Nimbus lookup tool part.
  A3 [DOM] a page preview appears (structure only).
- Cleanup: restart with the default configuration; delete the session and page.
- Evidence: stream.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-K-05 - The Nimbus child is respawned after it dies
- Spec: k-nimbus-mcp-embedded / process manager respawn
- Tags: regression, destructive, shell, needs:M8, needs:service-account
- Env: local (a process kill is needed)
- Budget: 480
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; the service runs locally; `E2E-K-01` passed.
- Steps:
  1. SHELL: `pgrep -f nimbus-mcp`
  2. SHELL: `pkill -f nimbus-mcp; sleep 2; pgrep -f nimbus-mcp || echo none`
  3. SHELL: `curl -si "$SERVICE_URL/service/status/nimbus"`
  4. MACRO NEW-CHAT
  5. MACRO SEND text="e2e-k05: build me a small page with a data table of orders"
  6. MACRO WAIT-STREAM-DONE timeoutMs=300000
  7. SHELL: `pgrep -f nimbus-mcp; grep -i "nimbus" .e2e-service.log | tail -20`
- Assert:
  A1 [SHELL] step 2 reports no child; step 3 answers 200 `ok` again (respawn on demand) or 503 once and then 200 on a repeat after 5 s.
  A2 [NET] the stream of step 6 completes without an `error` chunk.
  A3 [SHELL] a new child pid exists in step 7 and the log shows the respawn line; exactly one child.
- Cleanup: delete the session.
- Evidence: pids.txt, service-log-excerpt.txt, snapshot-final.txt
- Status: NOT RUN

## Coverage

- Readiness, tool set, exclusion in custom view, kill switch, respawn: `E2E-K-01` to `E2E-K-05`.
- Not covered by a browser card: recycle after three timeouts, stderr piping and the footprint measurement on the sandbox (`npm run smoke:nimbus`, task 8.2 of change K, needs the owner).
