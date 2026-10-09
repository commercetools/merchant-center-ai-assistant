# Change V (v-e2e-chrome-testing): implementation notes

## Summary

Branch `worktree-agent-a86acc1ef3a11e473` (reset to `develop` first; develop holds A to Q, S, U; R is still the foundation stub there). Nothing in this change could be run against a browser: there is no Merchant Center login, no deployed service and no Chrome DevTools tools in this job. Every card is therefore `Status: NOT RUN` and was written from the real code (service routes and controllers, component names and strings in `mc-app`, `mc-view-app`, `composed-apps`, the shipped scripts and runbook) and from each change's spec and notes.

Built:
- `e2e/`: `README.md` (attach to Chrome, environments, tiers, evidence, FAQ, index), `00-conventions.md` (card format, ids, tags, oracles, LLM rules, selector table, gateway replay, safety, evidence), `01-macros.md` (ATTACH, OPEN-APP, NEW-CHAT, SEND, WAIT-STREAM-DONE, ASSERT-CLEAN, RECORD-SESSION, CAPTURE-FORWARD, REPLAY-FORWARD, EVIDENCE, COLLECT, SERVICE-RESTART), `02-regression-order.md` (9 tiers), `03-traceability.md` (41 rows = the 41 KEEP/CHANGE rows of plans/01, plus 9 extra requirement rows), `.env.example`, `fixtures/` (five composed-page inputs).
- 19 playbooks with 147 cards: C 2, D 6, E 3, F 3, G 8, H 8, I 8 (I-01..I-07 + I-05b), J 6, K 5, L 8, M 6, N 6, O 6, P 16, Q 16, R 9, S 12, U 6, V 13.
- `scripts/e2e/`: `extract-scenario-ids.mjs` (modes `--list --lint --dangling --trace --tiers --inventory`), `ledger.mjs`, `cleanup.mjs`, `seed.mjs`, `co.mjs` (the read-only `CO` oracle), `report.mjs`, `collect-evidence.sh`, `make-bad-jwt.mjs`, `two-instance.mjs`, `dev-up.sh`, `dev-down.sh`, `lib/ct-client.mjs`, `lib/e2e-objects.mjs`.
- Tests: `scripts/tests/e2e-scenario-ids.test.mjs` (13) and `scripts/tests/e2e-helpers.test.mjs` (15).

Commands run (all in this worktree):
- `cd scripts && npm ci` ok. `node --test scripts/tests/*.test.mjs` -> 140 pass, 0 fail.
- `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace --tiers` -> `lint ok (147 cards in 19 playbooks)`, `dangling ok (132 ids in tasks, all have a card)`, `trace ok (41 mapped features = 41 KEEP/CHANGE rows, 9 extra requirements)`, `tiers ok (147 cards, each in exactly one tier)`.
- `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs`, `node scripts/check-connect-layout.mjs` -> ok. `grep -rnE "@commercetools\.com|ngrok|multiplatform" e2e scripts/e2e` -> empty. `openspec validate v-e2e-chrome-testing --strict` -> valid. `bash -n` on the three shell scripts ok. `git check-ignore` confirms `e2e/.env.e2e` and `plans/evidence/` are ignored and `e2e/.env.example` is not.

Ticked in `tasks.md`: 0.1 to 0.3, 1.3, 2.1 to 2.4, 3.5, 4.1 to 4.18, 5.1 to 5.9, 6.1, 6.2, 8.1, 9.2, 9.3. Writing tasks 4.x and 5.x are ticked because the cards are written and lint clean; their "runs green in task 7.x" parts are NOT met (nothing was run).

## Questions (for the owner)

1. Tunnel tool (RQ9): `cloudflared` is the default in `dev-up.sh`; any tool that prints a public https URL works through `E2E_TUNNEL_URL`. Which one is installed or allowed?
2. Should P, Q and S add the `data-testid` hooks the V design asked for (`chat-status`, `chat-composer`, `chat-send`, `chat-stop`, `session-list-item`, `admin-config-save`)? None exists (grep over the three `src` folders), so all selectors are accessible names and the stream-done check polls the composer textarea (`disabled` while a turn runs). A `data-status` hook would make it robust.
3. Should the composer get a Stop button? It has none, so `E2E-H-05` aborts by reloading mid-stream.
4. Should change C expose an instance id in `/service/status`? The V design requested it (amendment); the implemented body has `status, service, version, persistence, authConfigured, adminConfigured` only. `E2E-V-05` relies on the proxy log instead.
5. Should change U's `connect.mjs` get a plain `redeploy` command? `E2E-V-04` (sandbox) needs a redeploy without a config change; the card uses the Connect CLI directly (`commercetools connect deployment redeploy --key ...`, manual step M4).

## Missed features / gaps found in the spec

- **Id drift (V design vs the ids the owning changes wrote).** Other changes' ids win, so the cards follow them and the design's reserved meanings moved: D (design D-02 verifier negatives is now D-04; admin matrix D-05; startup guards D-06; D's own D-01 to D-03 stay), H (design H-02 tool part, H-03 chart/export, H-06 error frame are now H-02 viz or link, H-03 history, H-07 error line; H-06 is custom view; H-04 is the budget card, H-08 annotations), J (J-02 is the status cards, J-03 non-admin, J-04 Algolia, J-05 Stripe, J-06 broken Knowledge MCP), K (K-01 readiness, K-02 UI agent, K-03 non-UI, K-04 kill switch; the design's child respawn is K-05), L (L-01 to L-08 as in L's tasks; design L-03/L-04/L-05 differ), M (M-01 to M-06; design M-02 invalid page is M-04), N (N-01 to N-06; design N-03/N-04 differ), Q (Q-01 to Q-16; the whole design numbering lost), U (U-01 to U-03 from U's tasks; two-phase, idempotent redeploy and undeploy became U-04 to U-06). V's own `design.md` and its traceability table were left as they are; the final ids are in `e2e/03-traceability.md`.
- **The traceability table of the design has 48 rows, plans/01 has 41 KEEP/CHANGE rows.** The spec requires "number of mapped features equal to the number of KEEP/CHANGE rows". The new table has exactly 41 numbered rows with the first column of plans/01 verbatim, and a second table `X1..X9` for the extra requirements (reauth gate, statelessness, deployment, dropped features, secrets, non-admin experience, user id bootstrap, forged hints, framework). The lint treats `X<n>` rows as extra.
- **Wrong or stale text in other changes' tasks (not edited):** P task 20.9 says `POST feedback/submit` answers 200, the controller answers 201 (cards use 201); U/V design D11 says admin is "decided from the verified e-mail" (it is the user id); tasks 3.1 of V says `MC_AUDIENCE=<tunnel>/service`-style, the runbook and D say origin only.
- **L task names `service/scripts/check-gcp-cleanup.mjs` (E2E-L-07); L's notes say it was not written.** The card records SKIPPED(script missing) after the UI part until it exists.
- **Plan amendments log.** The proposal says the requested test hooks and the instance id are recorded in `plans/06-amendments-applied.md`. That file is internal and not mine to edit in this job; the list is in this file instead (questions 2 to 5).
- **Manual-step record (task 1.2 asks for M8 and M8a lines in `plans/manual-steps.md`):** not edited, same reason. M8a text: "MCP server args `chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222 --redactNetworkHeaders --workspace=<repo>/plans/evidence`, plus `chrome-devtools-b` on 9223, then restart the Claude Code session".
- `mc-view-app` is an iframe panel; whether `take_snapshot`, `evaluate_script` and `initScript` reach into a cross-origin iframe is unknown. Every S card carries that risk in the playbook header, `E2E-S-07` has a service-down fallback, and the first real run must settle it.
- The callback URL of the identity flow is single-use and secret; `E2E-I-06` reads it from `list_pages` after running the flow in a normal page instead of a popup. Whether the page keeps the URL (the callback page closes itself with `window.close()` when it has an opener) is unverified.
- Gateway replay (`REPLAY-FORWARD`) assumes the page's `fetch` is the one App Kit uses and that an `initScript` wrapper sees the forward-to headers. The design's own D11 assumed the headers can be copied from `get_network_request`; with `--redactNetworkHeaders` (which the plan requires) values are masked, so the capture happens inside the page.
- The unauthenticated `curl` to the bucket in `E2E-L-08` replaces the design's page `fetch` (the app CSP `connect-src` would block it).

## TODOs

- Not done because they need a browser, a deployment or the owner: 0.4 (MCP README and `--help` flags were taken from the design's finding 2, not re-read), 0.5 (legacy `FEATURES.md` not skimmed: the cards come from the implemented code), 1.1 (`service/.env.local` does not exist here), 1.2 (attach Chrome, M8), 3.1 and 3.2 (`dev-up.sh` and the app port question were written but never run; whether `mc-scripts start` accepts a port option is still unknown), 3.3 and 3.4 live runs (`seed`, `cleanup`, `two-instance`, `make-bad-jwt` are covered by unit tests with fakes only; `make-bad-jwt` was not sent to a real service), 7.1 to 7.3, 9.1.
- Selectors to confirm on the first run: the composer textarea `disabled` signal (`WAIT-STREAM-DONE`), `aria-label="Account"` and the Settings route, the attach button input, the delete confirmation button, the route shape `/e2e-param/<orderId>` (R), the exact texts R will render ("Published", "Draft", "Page not found: ...", "Legacy Page Format (...)" come from R's spec), `emulate networkConditions "No emulation"` value.
- `E2E-D-06` step 2 expects the startup error for an invalid `ADMIN_USER_IDS` entry to name the position and not the value; D's notes say all problems are reported at once but do not confirm the wording.
- `E2E-C-02` lists required keys by grepping `connect.yaml`; adjust to its real layout when run.
- Hand-offs for change W (docs): `docs/troubleshooting.md` (how to run the suite, tunnel, lost login, MCP workspace restriction), `CONTRIBUTING.md` (how to add a card, lint, id rules), `docs/architecture.md` (testing layers), `README.md` "Testing" section pointing to `e2e/README.md`, release notes (Z): E2E report summary.
- Evidence scrub step: `collect-evidence.sh` does not scan for secrets; V-10 does for responses. Add a scrub pass if screenshots can contain ids.
- Seeds named in the design but not written: `large-snapshot` (N-02 generates its payload in the page instead) and `sessions-many`.

## Deviations from the spec (with reason)

- Branch: stayed on the harness worktree branch instead of `spec/v-e2e-chrome-testing`.
- `e2e/.env.example` instead of `e2e/.env.e2e.example`: root `.gitignore` ignores `.env.*` except `.env.example`, so the longer name could not be committed. `E2E_PROJECT_KEY` and `E2E_MC_HOST` are empty in the example because `check-repo-rules` rejects keys containing `KEY` with a value and URLs that are not localhost or example domains. `E2E_PROJECT_DENYLIST` was added; `E2E_APP_PATH` was not (the `APP_URL`, `PAGES_URL`, `VIEW_URL` variables hold the full Merchant Center URLs of the apps, which `OPEN-APP` and the cards use).
- Tests live in `scripts/tests/e2e-*.test.mjs` (so the repo's `node --test scripts/tests/*.test.mjs` runs them), not `scripts/e2e/extract-scenario-ids.test.mjs`.
- The card key `Status` was added to the ten-key format (design D2 has nine keys plus evidence); the brief requires every card to say `Status: NOT RUN`. The lint accepts `NOT RUN`, `PASS`, `FAIL`, `SKIPPED(reason)`, `BLOCKED(reason)`, `FLAKE-PASS`.
- The lint additionally checks tag names, the oracle tag of each assertion, the tool names and `pageId` on every page-scoped tool call (the spec scenario "Exact tool names" asks for it), that the card letter matches the playbook file, and the `--tiers` and `--inventory` modes (task 6.1 asked for `--tiers`).
- `report.mjs` was added next to `collect-evidence.sh` so the report logic is unit-testable.
- `cleanup.mjs` never calls the service API (it has no user token); the cards delete through the UI where the delete path is under test and the script is the fallback and the sweep. Ledger entries may be removed without the `e2e-` key rule (session ids are UUIDs) but only in `ai-assistant-*` and `shared-composed-pages`, never in `ai-assistant-settings*` or `ai-assistant-identity-*`.
- `E2E-I-00`, the e-mail-claim probe, sign-in expiry and the clock helper (removed by the owner decision recorded in V's changelog) have no cards. `E2E-T-*` (conditional change T) has none: change T does not exist in the repository.
- Some shell-only cards (C, D-04, D-06, F-02) have no screenshot evidence; the spec's "at least `snapshot-final.txt` and `screenshot-final.png`" applies to browser cards, shell cards list their output files.
- `E2E-V-06` repeats the budget variables of change H as `CHAT_REQUEST_BUDGET_MS=20000 CHAT_FINALIZE_RESERVE_MS=3000` per the design; H's config enforces a minimum reserve, so the card says to use the smallest accepted value.
