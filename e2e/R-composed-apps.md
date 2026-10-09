# Playbook R: the composed pages application (`composed-apps`)

Owning change: `r-composed-apps-app` (ids `E2E-R-01` to `E2E-R-09` are defined in its `tasks.md`).
The application "AI Assistant Pages" lists the composed pages stored as Custom Objects in
`shared-composed-pages` and renders them; it never talks to the AI service. At the time these cards
were written change R was still being merged: `composed-apps/src/routes.tsx` was the foundation stub
showing "AI Assistant Pages foundation ready". The cards follow the spec of change R
(`openspec/changes/r-composed-apps-app/specs/composed-apps-app/spec.md`); texts that the spec names
exactly are used as written, other selectors need the first real run to confirm them.

All cards use the five seeded pages: `node scripts/e2e/seed.mjs composed-pages` (inputs in
`e2e/fixtures/composed-pages/`, see `e2e/fixtures/README.md`). `$PAGES_URL` is the Merchant Center URL
of the app (entry point `ai-assistant-pages` by default). The seeded pages are removed by
`node scripts/e2e/cleanup.mjs --sweep` (only keys starting with `e2e-`).

### E2E-R-01 - Menu entry and page list
- Spec: r-composed-apps-app / identity and menu entry, composed pages list
- Tags: smoke, needs:M8
- Env: both
- Budget: 180
- Pre: pages seeded; the app registered in the scratch project (M6/M9).
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$E2E_MC_HOST/$E2E_PROJECT_KEY/dashboard"}
  2. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-01/snapshot-menu.txt"}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the main-menu entry "AI Assistant Pages">}
  4. mcp__chrome-devtools__wait_for {pageId: $P, text: ["e2e-orders"], timeout: 60000}
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [DOM] the main menu contains "AI Assistant Pages" and following it loads `$PAGES_URL`.
  A2 [DOM] a table lists `e2e-orders` with the "Published" badge and `e2e-draft` with the "Draft" badge, with name, key, icon and dates columns, sortable.
  A3 [CONSOLE] no error-level message.
- Cleanup: none.
- Evidence: snapshot-menu.txt, snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-R-02 - A page renders
- Spec: r-composed-apps-app / page rendering
- Tags: smoke, needs:M8
- Env: both
- Budget: 180
- Pre: `E2E-R-01`.
- Steps:
  1. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the row e2e-orders>}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["E2E orders"], timeout: 60000}
  3. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch", "xhr"], pageSize: 50}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the back button>}
  5. MACRO EVIDENCE name=final
- Assert:
  A1 [DOM] the heading "E2E orders" renders and a back button returns to the list.
  A2 [NET] the page's data source is a GraphQL request to the platform through the Merchant Center proxy (`/graphql`), made with the signed-in user's own permissions.
  A3 [CONSOLE] no error-level message.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png, network.json
- Status: NOT RUN

### E2E-R-03 - Empty state
- Spec: r-composed-apps-app / empty container
- Tags: regression, destructive, needs:M8
- Env: both
- Budget: 240
- Pre: the container holds no composed pages (a scratch project that never had any, or after the operator moved them away; the scenario never deletes pages that do not start with `e2e-`). When non-`e2e-` pages exist the card is SKIPPED(container not empty).
- Steps:
  1. SHELL: `node scripts/e2e/cleanup.mjs --sweep` (removes only `e2e-` objects)
  2. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL"}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-03/snapshot-final.txt"}
- Assert:
  A1 [DOM] an informational message says no composed pages are available and that pages are created in the AI Assistant chat.
  A2 [CONSOLE] no error-level message.
- Cleanup: re-seed with `node scripts/e2e/seed.mjs composed-pages` for the following cards.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-R-04 - Permission denied
- Spec: r-composed-apps-app / least-privilege View permission
- Tags: regression, negative, needs:M8, needs:second-user
- Env: both
- Budget: 480
- Pre: the operator temporarily removes the application's View permission from user B's Team by hand (the framework never edits permissions) and restores it afterwards; BLOCKED(M10) when that is not arranged. Admin status of B is irrelevant for this app.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$E2E_MC_HOST/$E2E_PROJECT_KEY/dashboard"}
  2. mcp__chrome-devtools__take_snapshot {pageId: $P}
  3. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL"}
  4. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch", "xhr"], pageSize: 50}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-04/snapshot-final.txt"}
- Assert:
  A1 [DOM] the main menu has no "AI Assistant Pages" entry for user B.
  A2 [DOM] the direct URL shows the Merchant Center's unauthorized page.
  A3 [NET] no custom-object or composed-page data was requested.
- Cleanup: the operator restores the permission.
- Evidence: snapshot-menu.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-R-05 - Generated code that throws
- Spec: r-composed-apps-app / error boundary with phase
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 180
- Pre: `e2e-broken` seeded.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL/e2e-broken"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["render", "execute", "e2e-boom"], timeout: 60000}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-05/snapshot-final.txt"}
  4. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the Merchant Center main menu entry or the back button>}
- Assert:
  A1 [DOM] the error boundary shows a diagnostic naming the phase (`decode`, `transpile`, `execute`, `render` or `data-fetch`) and the component.
  A2 [DOM] the Merchant Center chrome (menu, project switcher) stays usable and the back button returns to the list.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-R-06 - A legacy data source fails alone
- Spec: r-composed-apps-app / GraphQL data sources only, per-source isolation
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 180
- Pre: `e2e-bq` seeded.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL/e2e-bq"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["E2E legacy target"], timeout: 60000}
  3. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-06/snapshot-final.txt"}
- Assert:
  A1 [DOM] only the `BIG_QUERY` source reports an explicit "unsupported" error; the heading and the second source's value still render.
  A2 [CONSOLE] no uncaught exception.
- Cleanup: none.
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

### E2E-R-07 - Route parameter binds a variable
- Spec: r-composed-apps-app / `fromUrl` variables
- Tags: regression, needs:M8
- Env: both
- Budget: 240
- Pre: `e2e-param` seeded; an existing order id of the scratch project is read (not typed from memory) from the Merchant Center orders list.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL/e2e-param/<orderId>"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["E2E route param"], timeout: 60000}
  3. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch", "xhr"], pageSize: 50}
  4. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-07/snapshot-final.txt"}
- Assert:
  A1 [NET] the GraphQL request carries the order id as the variable `id`.
  A2 [DOM] "Order id:" shows that id (the route shape `/e2e-param/<orderId>` follows the spec; the exact route pattern is confirmed on the first run and recorded here).
- Cleanup: none.
- Evidence: snapshot-final.txt, network.json (order id scrubbed)
- Status: NOT RUN

### E2E-R-08 - No service calls, no console errors
- Spec: r-composed-apps-app / never blocked by the AI service
- Tags: smoke, needs:M8
- Env: both
- Budget: 240
- Pre: pages seeded.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["e2e-orders"], timeout: 60000}
  3. mcp__chrome-devtools__click {pageId: $P, uid: <uid of the row e2e-orders>}
  4. mcp__chrome-devtools__wait_for {pageId: $P, text: ["E2E orders"], timeout: 60000}
  5. mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch", "xhr", "image"], pageSize: 100}
  6. mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}
- Assert:
  A1 [NET] no request to `/proxy/forward-to` and none to the chat service URL, and no `/files/...` image request.
  A2 [CONSOLE] zero error-level messages and no Content Security Policy message.
  A3 [DOM] with `CHAT_SERVICE_ENDPOINT_URL` unset (local run of the app without it) the list and a page still render.
- Cleanup: none.
- Evidence: network.json, console.txt, snapshot-final.txt
- Status: NOT RUN

### E2E-R-09 - Page not found and legacy format
- Spec: r-composed-apps-app / unknown key, unsupported schema version
- Tags: regression, negative, needs:M8
- Env: both
- Budget: 240
- Pre: a stored page with a schema version other than 5.0: the agent writes `e2e-legacy` directly as a Custom Object with the dev API client (`node scripts/e2e/seed.mjs legacy-page`, value with `schema.version: "4.0"`); BLOCKED(M3) when no dev client is available.
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL/does-not-exist"}
  2. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Page not found: does-not-exist"], timeout: 60000}
  3. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$PAGES_URL/e2e-legacy"}
  4. mcp__chrome-devtools__wait_for {pageId: $P, text: ["Legacy Page Format"], timeout: 60000}
  5. mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/E2E-R-09/snapshot-final.txt"}
- Assert:
  A1 [DOM] "Page not found: does-not-exist" is shown as a warning alert, not a blank page.
  A2 [DOM] "Legacy Page Format (4.0)" asks the user to rebuild the page in the assistant and nothing is rendered from the stored code.
- Cleanup: `node scripts/e2e/cleanup.mjs --run $RUN` (removes `e2e-legacy` and the seeded pages).
- Evidence: snapshot-final.txt, screenshot-final.png
- Status: NOT RUN

## Coverage

- Identity, list, rendering, permissions, error handling, data sources, isolation from the service, not found and legacy: `E2E-R-01` to `E2E-R-09`.
- Not covered: pagination beyond one GraphQL page (needs more than the page size of objects: `seed.mjs sessions-many` is for sessions only; add a `pages-many` fixture if the page size is small), polling data sources, the scope table of the README (a static comparison, see change R).
