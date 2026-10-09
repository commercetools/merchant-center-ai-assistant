# Macros

A macro is a named sequence of tool calls that cards use as one step (`MACRO SEND text="..."`).
Every call carries `pageId`. `$P` is the page id of the page under test; the agent reads it from
`list_pages` (ATTACH) and re-reads it after anything that opens or closes pages (popups, `new_page`).
`uid` values come from the latest snapshot only. Variables come from `e2e/.env.e2e`.

Selectors are accessible names, because no `data-testid` exists in the apps (see `00-conventions.md`
section 4). Where a macro could use a hook, the fallback is spelled out.

## ATTACH

1. `mcp__chrome-devtools__list_pages {}` : pick the page whose URL starts with `$E2E_MC_HOST/$E2E_PROJECT_KEY`; call its id `$P`. None: `mcp__chrome-devtools__new_page {url: "$E2E_MC_HOST/$E2E_PROJECT_KEY/dashboard"}` and re-run `list_pages`.
2. `mcp__chrome-devtools__select_page {pageId: $P, bringToFront: true}`
3. If the URL is a login page: stop, status `BLOCKED(M8)`.

For user B the same steps run against the second MCP server `chrome-devtools-b` (port 9223); a card
that needs both users names which server each step uses.

## OPEN-APP url

1. `mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "<url>", timeout: 60000}` (60 s absorbs a sandbox cold start of about 15 s).
2. `mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…", "Administrator access required", "AI Assistant Pages"], timeout: 60000}` : resolves when any text appears; pass the texts of the app under test.
3. `mcp__chrome-devtools__take_snapshot {pageId: $P}`

`<url>` is the Merchant Center URL of the app: `$E2E_MC_HOST/$E2E_PROJECT_KEY/<entryPointUriPath>`
(the apps run inside Merchant Center; the dev server host is registered as the app's URL in the
scratch project, manual step M6/M9). `mc-view-app` is opened at `$HOST_PAGE_URL` instead.

## NEW-CHAT

1. `mcp__chrome-devtools__take_snapshot {pageId: $P}`
2. `mcp__chrome-devtools__click {pageId: $P, uid: <uid of "Start a new chat">}`
3. `mcp__chrome-devtools__wait_for {pageId: $P, text: ["Ask about products, orders, pricing or promotions…"], timeout: 15000}`

## SEND text

1. `mcp__chrome-devtools__take_snapshot {pageId: $P}`
2. `mcp__chrome-devtools__click {pageId: $P, uid: <uid of the composer textbox>}`
3. `mcp__chrome-devtools__type_text {pageId: $P, text: "<text>", submitKey: "Enter"}`
4. `mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 20}` : the newest `forward-to` request is the stream (POST, header `x-forward-to` ends `/service/ai-chat/<sessionId>/message/stream`); note its `reqid` as `$STREAM`.

The prompt starts with `e2e-`. Count one turn against `E2E_MAX_TURNS`.

## WAIT-STREAM-DONE timeoutMs

No status hook exists, so the macro polls the page. The composer textarea (placeholder `Ask about
products, orders, pricing or promotions…`) is disabled while a turn runs and enabled again when the
turn is over (`mc-app/src/components/new-chat/composer/index.tsx`, `isDisabled={isLoading}`); the send
button cannot be used for this because it is also disabled whenever the composer is empty.

1. `mcp__chrome-devtools__evaluate_script {pageId: $P, function: "async (ms) => { const end = Date.now() + ms; const ready = () => { const t = document.querySelector('textarea[placeholder^=\"Ask about products\"]'); return !!t && !t.disabled; }; await new Promise(r => setTimeout(r, 1500)); while (Date.now() < end) { if (ready()) return {done: true, waitedMs: ms - (end - Date.now())}; await new Promise(r => setTimeout(r, 1000)); } return {done: false}; }", args: [<timeoutMs>]}` : the first pause lets the textarea become disabled after the send.
2. Fallback when the selector finds nothing (markup changed): `mcp__chrome-devtools__take_snapshot {pageId: $P}` and look for the composer textbox without the `disabled` property.

Result `done: false` fails the card when the budget of the card is exceeded.

## ASSERT-CLEAN

1. `mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error"]}` : zero entries whose source is the app (ignore third-party noise only if the card lists it).
2. `mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}` : no 4xx or 5xx except those the card expects.

## RECORD-SESSION

1. `mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}` : find the request whose `x-forward-to` ends `/service/session` (POST).
2. `mcp__chrome-devtools__get_network_request {pageId: $P, reqid: <reqid>, responseFilePath: "$TMPDIR/e2e/$RUN/<id>/session.json"}`
3. SHELL: `node scripts/e2e/ledger.mjs add session <sessionId> --run $RUN` (the session id is `data.id` of the response).

## CAPTURE-FORWARD (once per page load, before REPLAY-FORWARD)

1. `mcp__chrome-devtools__navigate_page {pageId: $P, type: "reload", initScript: "const f = window.fetch; window.__e2eForward = null; window.fetch = function (i, o) { try { const u = String((i && i.url) || i); if (u.includes('/proxy/forward-to') && o && o.headers) { window.__e2eForward = {url: u, headers: Object.fromEntries(new Headers(o.headers).entries())}; } } catch (e) {} return f.apply(this, arguments); };"}` : the init script runs before page scripts on the next navigation only.
2. `mcp__chrome-devtools__wait_for {pageId: $P, text: [<text of the app's ready state>], timeout: 60000}` : the bootstrap request has gone through the wrapper.
3. `mcp__chrome-devtools__evaluate_script {pageId: $P, function: "() => ({captured: !!window.__e2eForward, headerNames: window.__e2eForward ? Object.keys(window.__e2eForward.headers) : []})"}` : the header names are returned, never the values.

## REPLAY-FORWARD method path [body] [extraHeaders]

Sends one call to the service as the signed-in user of `$P`, with whatever the card forges.

1. `mcp__chrome-devtools__evaluate_script {pageId: $P, function: "async (method, path, body, extra) => { const c = window.__e2eForward; if (!c) return {error: 'no capture'}; const headers = {...c.headers, 'x-forward-to': '<SERVICE_URL>/service' + path, ...(extra || {})}; delete headers['content-length']; if (body !== null) headers['content-type'] = 'application/json'; const r = await fetch(c.url, {method, credentials: 'include', cache: 'no-store', headers, body: body === null ? undefined : JSON.stringify(body)}); const t = await r.text(); let code = null; try { code = JSON.parse(t).code ?? null; } catch (e) {} return {status: r.status, code, bytes: t.length, head: t.slice(0, 200)}; }", args: ["<method>", "<path>", <body or null>, <extra headers or null>]}` : `<SERVICE_URL>` is the literal service origin; the card shows the full path (for example `/system-prompt`). Forged identity hints go into `extra` (headers) or `body`; a query string belongs to `path`, never to the gateway URL.
2. Assert on `status` and `code` only; `head` is for the evidence file and must be scrubbed of ids.

Because the gateway signs the request for the signed-in user and the service decides admin from the
verified user id, the replay is a faithful test of the authorization.

## EVIDENCE name

1. `mcp__chrome-devtools__take_snapshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/<id>/snapshot-<name>.txt"}`
2. `mcp__chrome-devtools__take_screenshot {pageId: $P, filePath: "$TMPDIR/e2e/$RUN/<id>/screenshot-<name>.png", format: "png"}`
3. `mcp__chrome-devtools__list_console_messages {pageId: $P, types: ["error", "warn"]}` : copy to `console.txt`.
4. `mcp__chrome-devtools__list_network_requests {pageId: $P, resourceTypes: ["fetch"], pageSize: 50}` : store `reqid, method, url, status` and the `x-forward-to` header (read with `get_network_request`) in `network.json`.

Final evidence of every card uses the name `final`.

## COLLECT

SHELL: `bash scripts/e2e/collect-evidence.sh $RUN` : moves `$TMPDIR/e2e/$RUN` into `plans/evidence/$RUN/`,
writes `report.md` from the `result.json` files and exits 1 when any scenario failed.

## SERVICE-RESTART (local only)

1. SHELL: `lsof -ti tcp:8080 | xargs kill` : stop the service (also stop an orphaned `nimbus-mcp` child, see `E2E-K-02`).
2. SHELL: `until ! curl -sf "$SERVICE_URL/service/status" >/dev/null; do sleep 1; done`
3. SHELL: `bash scripts/e2e/dev-up.sh --service-only`
4. SHELL: `until curl -sf "$SERVICE_URL/service/status" >/dev/null; do sleep 1; done`

The tunnel keeps running so `SERVICE_URL` stays the same.
