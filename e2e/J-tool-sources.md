# Playbook J: third-party tool sources

Owning change: `j-third-party-tool-sources` (ids `E2E-J-01` to `E2E-J-06` are defined in its
`tasks.md`). Provider credentials are Connect configuration, never typed into the UI (owner
decision Q4). The service exposes one read-only route, `GET /service/mcp/providers`, answering for
each of `contentstack`, `algolia` and `stripe`: `provider`, `configured`, `enabled` and `missingKeys`
(names only, never values). Required keys: Contentstack `CONTENTSTACK_API_KEY` and
`CONTENTSTACK_MANAGEMENT_TOKEN`, Algolia `ALGOLIA_MCP_URL`, Stripe `STRIPE_SECRET_KEY`.

Cards that need a provider tagged `needs:secrets` use dummy values deployed with
`node scripts/connect/connect.mjs configure <KEY>=<value>` (sandbox) or the local service
environment; they are SKIPPED(reason) when the deployment has none. Dummy values:
`STRIPE_SECRET_KEY=sk_test_e2edummykey`, `ALGOLIA_MCP_URL=https://e2e-dummy.example.org/mcp`,
`CONTENTSTACK_API_KEY=e2e-dummy-key`, `CONTENTSTACK_MANAGEMENT_TOKEN=e2e-dummy-token`.

### E2E-J-01 - Knowledge MCP answers and its tools can be switched off
- Spec: j-third-party-tool-sources / commercetools Knowledge MCP and developer-tips prompt
- Tags: smoke, needs:M8, needs:service-account
- Env: both (needs outbound access to the public documentation MCP)
- Budget: 300
- Pre: tool-call-log mode `all` or `tools`.
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-j01: which commercetools API creates a cart discount?"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. mcp__chrome-devtools__take_snapshot {pageId: $P}
  5. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  6. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-J-01/snapshot-tools.txt"}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of one switch inside the commercetools-knowledge group>}
  8. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Save>}
  9. MACRO SEND text="e2e-j01b: search the documentation for custom objects"
  10. MACRO WAIT-STREAM-DONE timeoutMs=180000
- Assert:
  A1 [DOM] a tool part from `commercetools-documentation-search` (or another Knowledge tool) appears after step 2; no error frame in the stream.
  A2 [DOM] the Tools panel shows the group `commercetools-knowledge` with 6 tools.
  A3 [NET] after switching one tool off and saving, `GET .../session/<id>/tools` lists it as disabled and the second turn does not call it.
- Cleanup: switch the tool back on and Save; delete the session.
- Evidence: snapshot-tools.txt, snapshot-final.txt, tools.json
- Status: NOT RUN

### E2E-J-02 - Provider status cards (administrator)
- Spec: j-third-party-tool-sources / read-only `GET /mcp/providers`
- Tags: regression, needs:M8, needs:secrets
- Env: both
- Budget: 480
- Pre: user A; first run with no provider keys configured; the second part after `configure STRIPE_SECRET_KEY=sk_test_e2edummykey` and a redeploy (local: restart with the variable).
- Steps:
  1. MACRO OPEN-APP $APP_URL
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Account" in the rail>}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Settings entry, section "Connected sources">}
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}
  6. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid of GET with x-forward-to ending /service/mcp/providers>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-J-02/providers-1.json"}
  7. SHELL: `node scripts/connect/connect.mjs configure STRIPE_SECRET_KEY=sk_test_e2edummykey` (local: restart with the variable)
  8. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  9. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <new reqid>, responseFilePath: "$TMPDIR/e2e/$RUN/E2E-J-02/providers-2.json"}
- Assert:
  A1 [NET] first response: three entries with `configured: false` and `missingKeys` naming the keys above.
  A2 [DOM] first snapshot: three cards (Contentstack, Algolia, Stripe) showing "Not configured".
  A3 [NET] after step 7: Stripe has `configured: true`, `enabled: true`; the card shows "Configured at deployment (Connect configuration)".
  A4 [DOM] neither responses nor DOM contain `sk_test_e2edummykey` (grep both).
  A5 [DOM] the section has no input, form or Save button.
- Cleanup: remove the dummy key if the deployment should stay unconfigured (`configure STRIPE_SECRET_KEY=` with an empty value, or the previous value).
- Evidence: providers-1.json, providers-2.json, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-J-03 - Providers as non-admin: same read-only data, no write routes
- Spec: j-third-party-tool-sources / no credential CRUD
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 240
- Pre: user B attached on `chrome-devtools-b`.
- Steps:
  1. MACRO CAPTURE-FORWARD
  2. MACRO REPLAY-FORWARD GET /mcp/providers null null
  3. MACRO REPLAY-FORWARD POST /mcp/configs {"provider":"stripe"} null
  4. MACRO REPLAY-FORWARD PUT /mcp/providers {"provider":"stripe"} null
- Assert:
  A1 [NET] step 2 answers 200 with the same names-only data (no value of any key).
  A2 [NET] steps 3 and 4 answer 404 (the routes do not exist).
  A3 [DOM] as user B the Connected sources cards show status only (see `E2E-Q-09`).
- Cleanup: none.
- Evidence: replay-results.json
- Status: NOT RUN

### E2E-J-04 - Algolia: an unsafe host is refused, a valid one adds a tool group
- Spec: j-third-party-tool-sources / `ALGOLIA_MCP_URL` validation (SSRF guard)
- Tags: regression, negative, destructive, needs:M8, needs:secrets
- Env: both
- Budget: 600
- Pre: `E2E_ALLOW_DESTRUCTIVE=1`; the Algolia host is a dummy: the tools cannot succeed, only the wiring is checked.
- Steps:
  1. SHELL: `node scripts/connect/connect.mjs configure ALGOLIA_MCP_URL=https://169.254.169.254/x` (local: restart with the variable)
  2. MACRO OPEN-APP $APP_URL
  3. MACRO REPLAY-FORWARD GET /mcp/providers null null
  4. SHELL: `node scripts/connect/connect.mjs configure ALGOLIA_MCP_URL=https://e2e-dummy.example.org/mcp`
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  7. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [NET] after step 1 the Algolia entry is `configured: false` (invalid value) and no `algolia` group is in the Tools panel; the service log says `not configured (invalid: ALGOLIA_MCP_URL)` without the value.
  A2 [DOM] after step 4 the Tools panel shows the group `algolia` with an `all_tools` entry; switching it off removes Algolia tools from the next turn.
  A3 [NET] the stream of a turn that does not use Algolia still completes (a failing remote does not break the turn).
- Cleanup: restore the previous `ALGOLIA_MCP_URL` (empty for a plain deployment).
- Evidence: providers.json, snapshot-final.txt
- Status: NOT RUN

### E2E-J-05 - Stripe with a dummy key: validated, menu group, best-effort turn
- Spec: j-third-party-tool-sources / Stripe toolkit
- Tags: regression, needs:M8, needs:secrets, needs:service-account
- Env: both
- Budget: 480
- Pre: `STRIPE_SECRET_KEY=sk_test_e2edummykey` deployed (see J-02).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-j05: list my stripe customers"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-J-05/snapshot-tools.txt"}
- Assert:
  A1 [DOM] the Tools panel lists a Stripe group (the number of tools is recorded; the spec says 24 menu entries while the toolkit version in use provides fewer, see the notes of change J).
  A2 [NET] the stream completes without an `error` chunk; the tool call inside the turn may fail (dummy key) and is shown as a failed tool result, not as a broken stream.
  A3 [DOM] no key value in the DOM (`sk_test_e2edummykey` absent).
- Cleanup: delete the session.
- Evidence: snapshot-tools.txt, stream.txt
- Status: NOT RUN

### E2E-J-06 - A broken Knowledge MCP does not break the turn
- Spec: j-third-party-tool-sources / source isolation and timeouts
- Tags: regression, negative, needs:M8, needs:service-account
- Env: local
- Budget: 480
- Pre: the service runs with `MCP_TOOLS_TTL_MS` low and outbound access to the documentation host blocked (for example a hosts-file entry or a firewall rule on the dev machine); the exact blocker is recorded. Alternative: run the unit test `knowledge.spec.ts` (`cd service && npx jest tests/tool-sources/knowledge`).
- Steps:
  1. MACRO NEW-CHAT
  2. MACRO SEND text="e2e-j06: say hi"
  3. MACRO WAIT-STREAM-DONE timeoutMs=180000
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Choose what the assistant can reach">}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P}
- Assert:
  A1 [NET] the stream completes without an `error` chunk although the Knowledge MCP is unreachable.
  A2 [DOM] the Tools panel has no `commercetools-knowledge` group (or it is empty); other groups are present.
  A3 [SHELL] the service log names the failed source with a short message and no secret.
- Cleanup: remove the block; restart the service.
- Evidence: snapshot-final.txt, service-log-excerpt.txt
- Status: NOT RUN

## Coverage

- Knowledge MCP: `E2E-J-01`, `E2E-J-06`; provider status and absence of credential forms: `E2E-J-02`, `E2E-J-03`, `E2E-Q-08`, `E2E-Q-09`, `E2E-Q-14`; Algolia: `E2E-J-04`; Stripe: `E2E-J-05`; Contentstack: only the status card (a real Contentstack call needs a real stack, not available with dummy keys).
- Not covered: Contentstack tool behaviour, Stripe tool behaviour against Stripe, the seven Contentstack regions.
