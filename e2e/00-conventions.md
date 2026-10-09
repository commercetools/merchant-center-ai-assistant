# Conventions: how a scenario card is written

A scenario card is one end-to-end test case. An agent runs it with the Chrome DevTools MCP
(`mcp__chrome-devtools__*`) and shell commands. Cards are strict enough to lint
(`node scripts/e2e/extract-scenario-ids.mjs --lint`) and exact enough that a different agent run is
reproducible. Every card in this folder is `Status: NOT RUN` until someone has run it and recorded
the result; a card is never marked PASS by writing it.

## 1. Ids

`E2E-<S>-<nn>[letter]`: `<S>` is the letter of the change that owns the behaviour (`V` for
cross-cutting scenarios), `<nn>` two digits, an optional lower-case letter for a variant
(`E2E-I-05b`). The file that holds a card starts with the same letter (`I-identity-mcp.md` holds
`E2E-I-*`). Ids that another change already defined in its `tasks.md` are never renamed: the card
copies the intent and the owning change stays the source of truth. Where the real implementation or
a later decision differs from the id list that change wrote down, the card says so in `Spec:` and
`e2e/03-traceability.md` follows the card.

## 2. Card template

```
### E2E-<S>-<nn> - <title>
- Spec: <change-id> / <requirement or task>
- Tags: smoke, regression, negative, ...
- Env: local | sandbox | both (reason when not both)
- Budget: <seconds>
- Pre: <state, fixtures, manual steps>
- Steps:
  1. mcp__chrome-devtools__navigate_page {pageId: $P, type: "url", url: "$APP_URL"}
  2. SHELL: curl -si "$SERVICE_URL/service/status"
- Assert:
  A1 [NET] ...
  A2 [DOM] ...
  A3 [CONSOLE] no error-level message from app code
- Cleanup: ...
- Evidence: snapshot-final.txt, screenshot-final.png, network.json, console.txt
- Status: NOT RUN
```

Rules the lint enforces:

- All ten keys are present, in any order: `Spec, Tags, Env, Budget, Pre, Steps, Assert, Cleanup, Evidence, Status`.
- One tool call (or one `SHELL:` command, or one macro) per numbered step, on one line. A tool line
  names an existing tool and, except for `list_pages` and `new_page`, gives `pageId:` (every
  page-scoped tool needs it; the MCP routes by page id, so after `new_page`, `select_page` or a popup
  the agent re-reads the id from `list_pages`).
- Each assertion starts with `A<n>` and an oracle tag. Oracles: `DOM` (snapshot text or
  `evaluate_script`), `NET` (`list_network_requests` / `get_network_request`), `CONSOLE`
  (`list_console_messages`), `SHELL` (command output or exit code), `CO` (a Custom Object read with the
  scratch project's dev API client).
- `Env` starts with `local`, `sandbox` or `both`.
- `Tags` come from: `smoke`, `regression`, `negative`, `slow`, `destructive`, `shell`, `needs:M8`
  (a logged-in Chrome), `needs:second-user` (the non-admin user B, manual step M10), `needs:secrets`
  (dummy provider keys deployed through Connect configuration), `needs:service-account` (the GCP key,
  manual step M5), `needs:deployment` (a deployed connector).
- `Status` is `NOT RUN` in the repository. A run records `PASS`, `FAIL`, `SKIPPED(reason)`,
  `BLOCKED(reason)` or `FLAKE-PASS` in `plans/evidence/<run-id>/<id>/result.json` and `report.md`,
  not in the card.

Steps use shell-style variables from `e2e/.env.e2e`: `$P` (the page id of the page under test),
`$APP_URL`, `$PAGES_URL` (Merchant Center URLs of `mc-app` and `composed-apps`, ending in the entry point URI path), `$VIEW_URL`, `$HOST_PAGE_URL` (the product page that hosts the `mc-view-app` panel), `$SERVICE_URL` (origin, no `/service`),
`$E2E_PROJECT_KEY`, `$E2E_MC_HOST`. Users: **user A** is the administrator (its Merchant Center user
id is in `ADMIN_USER_IDS`), **user B** is the non-admin user. Both use the app's ordinary permission
through a Team and no permission is ever edited by a scenario. User ids are never written into a
card or into evidence; evidence says `<user-id-a>` and `<user-id-b>`.

A card section titled `Coverage` at the end of each playbook lists which spec requirements the cards
cover; a requirement that no card can cover is listed under `Not covered` with the reason.

## 3. What is asserted and what is not (LLM output)

Model output is not deterministic. Cards assert structure and protocol: the stream request answers
200 with `text/event-stream`, a finish indication arrives, the expected part type appears (tool part,
chart, composed page, image), no error frame, HTTP statuses of the service calls, persisted data, and
zero error-level console messages from application code. Cards never assert exact wording.

- Prompts start with `e2e-` so test data is recognisable and removable.
- A content check uses a nonce: the prompt asks the model to reply with `E2E-OK-<nonce>` and the check
  is **soft**. A failed soft check is repeated once in a new session; a pass on the retry is recorded
  as `FLAKE-PASS`, a second failure as `FAIL`.
- **Hard** assertions are never retried: network status codes, authorization results (403
  `ADMIN_REQUIRED`, 401), console errors, persisted state.
- Timeouts: first token 30 s (cold start 60 s), a complete plain turn 120 s, a tool turn 180 s,
  budget scenarios as declared on the card.
- Failure classes: `INFRA` (gateway 5xx, tunnel down, Merchant Center session lost: repeat the whole
  tier once after the preflight), `LLM` (a soft assertion), `BUG` (everything else). Two consecutive
  FAILs of the same card stop the tier.
- A run is capped by `E2E_MAX_TURNS` chat turns (cost cap).

## 4. Selectors

At the time of writing none of the three apps contains a `data-testid` or `data-status` attribute
(checked by grep in `mc-app/src`, `mc-view-app/src`, `composed-apps/src`). The design wished for hooks
(`chat-status`, `chat-composer`, `chat-send`, `chat-stop`, `session-list-item`, `admin-config-save`);
they were never delivered, so cards use **accessible names** from `take_snapshot` and the macros in
`01-macros.md` encode the ones that exist:

| Element | Accessible name or text |
|---|---|
| composer | textbox with placeholder `Ask about products, orders, pricing or promotions…` |
| send | button `Send message` (disabled while a turn runs) |
| new chat | `Start a new chat` (rail tile), empty-state heading in the chat area |
| chats | rail item `Chats`, search box `Search your chats`, row action `Delete chat` |
| tools panel | button `Choose what the assistant can reach`, search box `Filter tools` |
| settings | rail account menu `Account`, sections `About`, `Detail level`, `System prompt`, `Connected sources` |
| admin notice | heading `Administrator access required` |
| user id | text `Your user ID` with a Copy button |
| backoffice | route `<app>/backoffice`, tabs `Thread List`, `Query Threads`, `Feedback` (`Backoffice sections`) |
| feedback | thumbs buttons under a reply, popup field `What went wrong`, `Close feedback` |
| pages | `Save Page`, `Page settings`, `Delete page` |
| reauth | dialog text `session has expired` with `Sign in again` |

`uid` values come from the most recent `take_snapshot` only; re-snapshot after every DOM change. When
a name changes in the code the card is updated, not the code. A scenario that needs a `data-testid`
the code does not have is listed as a gap in `plans/implementation/v-notes.md`.

## 5. Gateway replay (authorization tests)

The browser never talks to the service directly. All calls go to
`<mcApiUrl>/proxy/forward-to` with the real target in the header `x-forward-to` (and optional
`x-forward-header-*` relays), and the gateway adds a short-lived signed token for the signed-in user.
`list_network_requests` therefore shows only that URL; the service path is in the request header,
read with `get_network_request`. The gateway URL never gets a query string.

To test authorization as a given user the agent **replays** a legitimate call from that user's page:
copy the request headers of a real forwarded call (keep the `x-forward-*` family, drop
`content-length`), then from the same page run `evaluate_script` with a `fetch` to the same gateway
URL, another `x-forward-to` and another method and body. The gateway signs for the signed-in user, so
the replay is a faithful test of the service's authorization. Macro `REPLAY-FORWARD` in
`01-macros.md` has the exact tool calls. Because the Chrome MCP is started with `--redactNetworkHeaders`,
sensitive header values are masked in tool output; the page's own `fetch` is therefore used with
headers the page itself reads (the macro captures them inside the page with a one-time
`fetch` wrapper installed by `initScript`, not through the tool output).

## 6. Safety rules

- Runs target only the scratch project named in `E2E_PROJECT_KEY`. The preflight (`E2E-V-01`)
  aborts if the project key in the page URL differs, if it appears in `E2E_PROJECT_DENYLIST`, or if
  the host is not `E2E_MC_HOST`. Nothing is written before the preflight passes.
- Third-party credentials are dummy values deployed through Connect configuration (for example
  `STRIPE_SECRET_KEY=sk_test_e2edummykey`, `ALGOLIA_MCP_URL` pointing at a dummy https host). The UI
  has no credential forms, so nothing is ever typed into a browser field.
- No secret, token, service-account key or real user id is printed or saved. `list_network_requests`
  output and evidence are scrubbed before sharing; evidence stays under `plans/evidence/`, which is
  git-ignored and never published.
- No Merchant Center permission, Team or user is edited by any scenario (R-04 asks the operator to
  do it once by hand and says so).
- Destructive scenarios (service restart, undeploy, `configure` redeploys) carry the tag
  `destructive` and run only with `E2E_ALLOW_DESTRUCTIVE=1`, after tiers 1-6 are green.

## 7. Evidence

Per scenario: `plans/evidence/<run-id>/<scenario-id>/` with `snapshot-final.txt`,
`screenshot-final.png`, `network.json` (reqid, method, url, status, `x-forward-to`),
`console.txt` and `result.json` `{id, status, startedAt, durationMs, notes, retries}`. Run id:
`YYYYMMDD-HHMM-<env>`. By default the MCP writes files only below the OS temp directory unless a
workspace root is allowed (`--workspace`), so cards write to `$TMPDIR/e2e/<run-id>/<id>/...` when the
workspace is not configured and `scripts/e2e/collect-evidence.sh <run-id>` moves them into
`plans/evidence/` and writes `report.md`. Cards list evidence file names, not paths.

## 8. Adding a card

1. Pick the next free id of the owning letter and add the heading to the matching playbook.
2. Fill all ten keys using the template above and macros from `01-macros.md`.
3. Add the id to exactly one tier in `02-regression-order.md` and to a row in `03-traceability.md`.
4. Run `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace --tiers`.
