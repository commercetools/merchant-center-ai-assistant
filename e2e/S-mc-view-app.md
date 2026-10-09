# Playbook S: the custom view panel (`mc-view-app`)

Owning change: `s-mc-view-app` (ids `E2E-S-01` to `E2E-S-12` are defined in its `tasks.md`). The view
"AI Assistant" is a Merchant Center Custom View of type `CustomPanel` (size small) with 65 locators.
It appears in the custom-view toolbar of built-in pages (product details, order details, and so on)
and renders in an iframe. `$HOST_PAGE_URL` is a product detail page of the scratch project (create a
product `e2e-product` once through the Merchant Center UI and record its page URL in
`e2e/.env.e2e`); `$VIEW_URL` equals `$HOST_PAGE_URL` for these cards. Every service URL the panel
calls carries the query parameter `customView` (feature flag), and the panel has no tool menu, no
feedback popup and no view switcher.

Open risk for every card in this file: the panel content lives in a cross-origin iframe. Whether
`take_snapshot` and `evaluate_script` of the host page reach into it was not verified. If they do not,
the agent selects the iframe's own target (`list_pages` may list it as a separate page) or records
`BLOCKED(frame not reachable)` and the case is reported in `plans/implementation/v-notes.md`.

### E2E-S-01 - The panel appears on a product page
- Spec: s-mc-view-app / registration and locators
- Tags: smoke, needs:M8
- Env: both
- Budget: 180
- Pre: `E2E-V-01` passed; the custom view is registered in the scratch project (M9) with its View permission given to users A and B.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$HOST_PAGE_URL", timeout: 60000}
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon in the custom view toolbar>}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-01/snapshot-final.txt"}
- Assert:
  A1 [DOM] the AI Assistant custom view icon is present on the product page for user A and for user B.
  A2 [DOM] opening it shows the panel with the composer (placeholder `Ask about products, orders, pricing or promotions…`) or, for an unbound project, the instruction of `E2E-S-04`.
  A3 [CONSOLE] no error-level message from the panel.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-S-02 - Send a message; the stream completes and carries `customView`
- Spec: s-mc-view-app / chat through the gateway with the custom-view flag
- Tags: smoke, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: `E2E-S-01`; binding and connection exist (`E2E-I-03`).
- Steps:
  1. MACRO SEND text="e2e-s02: reply with one short sentence"
  2. MACRO WAIT-STREAM-DONE timeoutMs=120000
  3. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 100}
  4. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM}
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [NET] the stream request answers 200 `text/event-stream` and every forwarded service URL (session, messages, stream) carries `customView=...` in the `x-forward-to` target; the gateway URL itself has no query string.
  A2 [DOM] a user bubble and an assistant bubble appear and the composer is enabled again.
  A3 [DOM] an attachment (use `upload_file` once with a small image) renders without a content-security-policy console error (`data:` images, see the notes of change S).
- Cleanup: delete the panel session (`E2E-G-07` shows how).
- Evidence: snapshot-final.txt, screenshot-final.png, network.json
- Status: NOT RUN

### E2E-S-03 - Entity awareness (structure only)
- Spec: s-mc-view-app / host page context to the assistant
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 240
- Pre: product page of `e2e-product`.
- Steps:
  1. MACRO SEND text="e2e-s03: what is the name of the product I am looking at"
  2. MACRO WAIT-STREAM-DONE timeoutMs=180000
  3. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: $STREAM, requestFilePath: "$TMPDIR/e2e/$RUN/E2E-S-03/request.json"}
- Assert:
  A1 [NET] the request body carries the host page context (page type and id) in a field recorded in the evidence; the stream completes with no `error` chunk.
  A2 [DOM] soft: the answer mentions the product's name (retry once in a new session on a miss).
- Cleanup: delete the session.
- Evidence: request.json (ids scrubbed), snapshot-final.txt
- Status: NOT RUN

### E2E-S-04 - Project without binding: instruction, no composer
- Spec: s-mc-view-app / read-only binding gate
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 240
- Pre: no binding (`E2E-I-07`); user B attached (also run once as user A).
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$HOST_PAGE_URL", timeout: 60000}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-04/snapshot-final.txt"}
- Assert:
  A1 [DOM] the panel shows "This project is not connected to an identity-mode Managed MCP Server yet. Ask an administrator to set one up in the AI Assistant application." and no chat composer, for user A and for user B alike (the view never binds).
  A2 [NET] no `PUT managed-mcp-identity` and no `mcp-servers` request from the panel.
- Cleanup: rebind with `E2E-I-02` for the following cards.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-S-05 - Identity connect gate
- Spec: s-mc-view-app / per-user identity connect gate
- Tags: regression, needs:M8, needs:deployment
- Env: both
- Budget: 480
- Pre: bound project, the user is not connected (`E2E-I-05`).
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$HOST_PAGE_URL", timeout: 60000}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Connect my account" in the panel>}
  4. mcp__chrome-devtools__list_pages {}
  5. mcp__chrome-devtools__select_page {pageId: <popup page id>, bringToFront: true}
  6. mcp__chrome-devtools__click {pageId: <popup page id>, uid: <uid of the consent button, only when asked>}
  7. mcp__chrome-devtools__select_page {pageId: $P, bringToFront: true}
  8. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…"], timeout: 60000}
- Assert:
  A1 [DOM] the "Connect my account" gate is shown first, then the composer after the flow.
  A2 [NET] `POST .../authorize`, `GET .../status` (`connected: true`) and `POST .../verify` succeeded.
- Cleanup: none.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-S-06 - Popup blocked or cancelled
- Spec: s-mc-view-app / popup failure is recoverable
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 300
- Pre: bound project, user not connected.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Connect my account" in the panel>}
  2. mcp__chrome-devtools__list_pages {}
  3. mcp__chrome-devtools__close_page {pageId: <popup page id>}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-06/snapshot-final.txt"}
- Assert:
  A1 [DOM] an error message is shown and the button is usable again (a blocked popup cannot be simulated; closing the popup before completion is the checked case).
  A2 [CONSOLE] no uncaught exception.
- Cleanup: none.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-S-07 - Service unreachable: error and retry
- Spec: s-mc-view-app / bootstrap failure handling
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 300
- Pre: none.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$HOST_PAGE_URL", initScript: "const f = window.fetch; window.fetch = (i, o) => String((i && i.url) || i).includes('/proxy/forward-to') ? Promise.resolve(new Response('{}', {status: 401})) : f(i, o);"}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  3. mcp__chrome-devtools__wait_for {pageId: $P, text: ["session has expired", "unavailable"], timeout: 15000}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-07/snapshot-final.txt"}
  5. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  6. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  7. mcp__chrome-devtools__click {pageId: $P, uid: <uid of Retry>}
- Assert:
  A1 [DOM] within 10 s the panel shows an error ("Your Merchant Center session has expired" with "Sign in again", or "The AI Assistant is unavailable") and a Retry action; never a blank panel.
  A2 [DOM] after the reload without the init script and a Retry the panel loads normally.
  A3 [DOM] the init script wraps the page's `fetch` only; if the panel iframe has its own `fetch`, use the service-down variant instead (stop the local service) and record which variant was used.
- Cleanup: reload without the init script.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-S-08 - Reload resumes the session
- Spec: s-mc-view-app / session handling in an embedded panel
- Tags: regression, needs:M8, needs:service-account
- Env: both
- Budget: 300
- Pre: a panel session with one message (`E2E-S-02`).
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload"}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  3. mcp__chrome-devtools__wait_for {pageId: $P, text: ["e2e-s02"], timeout: 60000}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 100}
- Assert:
  A1 [DOM] the earlier message is shown again.
  A2 [NET] session reads carry the `customView` flag and one `POST session` is not made when the stored session is found.
- Cleanup: delete the session.
- Evidence: snapshot-final.txt, network.json
- Status: NOT RUN

### E2E-S-09 - A second locator: order detail page
- Spec: s-mc-view-app / locators
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: an order exists in the scratch project (any).
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$E2E_MC_HOST/$E2E_PROJECT_KEY/orders", timeout: 60000}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the first order row>}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-09/snapshot-final.txt"}
- Assert:
  A1 [DOM] the icon and the panel are present on the order detail page, with the composer.
  A2 [CONSOLE] no error-level message.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-S-10 - Forbidden features are absent
- Spec: s-mc-view-app / reduced chat surface
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 120
- Pre: panel open.
- Steps:
  1. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-10/snapshot-final.txt"}
  2. mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({tools: !!document.querySelector('[aria-label=\"Choose what the assistant can reach\"]'), feedback: !!document.querySelector('[aria-label^=\"Start feedback\"], [aria-label=\"Feedback\"]'), switcher: !!document.querySelector('[aria-label=\"Assistant view\"]')})"}
- Assert:
  A1 [DOM] no tool-menu trigger, no feedback button, no view switcher in the panel.
  A2 [DOM] composer, message list, typing indicator and empty state are present.
- Cleanup: none.
- Evidence: snapshot-final.txt
- Status: NOT RUN

### E2E-S-11 - Same panel for administrator and non-admin; no e-mail anywhere
- Spec: s-mc-view-app / no identity hints in requests
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 360
- Pre: users A and B attached; both connected.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$HOST_PAGE_URL", timeout: 60000}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the AI Assistant icon>}
  3. MACRO SEND text="e2e-s11: hi"
  4. MACRO WAIT-STREAM-DONE timeoutMs=120000
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 100}
  6. mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <each forward-to request>, requestFilePath: "$TMPDIR/e2e/$RUN/E2E-S-11/req-<n>.json"}
- Assert:
  A1 [DOM] user A and user B see the same panel with no admin control.
  A2 [NET] no forwarded URL, header or body contains `userEmail`, an e-mail address or `userLabel` with an address (grep the saved requests for `@`).
- Cleanup: delete the sessions.
- Evidence: scan.json (counts only), snapshot-final.txt
- Status: NOT RUN

### E2E-S-12 - The panel footer shows the user's own id
- Spec: s-mc-view-app / "Your user ID" line
- Tags: regression, needs:M8, needs:second-user
- Env: both
- Budget: 240
- Pre: users A and B attached.
- Steps:
  1. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-S-12/snapshot-final.txt"}
  2. mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Copy">}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 100}
- Assert:
  A1 [DOM] "Your user ID" is shown in the footer (or the overflow menu when space is tight) as plain text, no input, with a value equal to the bootstrap `userId`; user A's value differs from user B's.
  A2 [DOM] after Copy the button reads "Copied" and no new `forward-to` request was sent.
- Cleanup: none.
- Evidence: snapshot-final.txt (ids replaced by placeholders)
- Status: NOT RUN

## Coverage

- Registration, chat, context, binding, connect, errors, session, locators, reduced surface, identity hints, user id: `E2E-S-01` to `E2E-S-12`; the service side of custom-view sessions: `E2E-G-07`, `E2E-H-06`, `E2E-K-03`, `E2E-M-06`.
- Not covered: the other 63 locators (two are sampled), registration with Merchant Center itself (manual step M9), the permission display for a user without the View permission (the same mechanism as `E2E-R-04`).
