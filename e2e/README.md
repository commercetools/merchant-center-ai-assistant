# End-to-end playbooks (Chrome DevTools MCP)

The owner does not test by hand: an agent proves every feature in a real browser with the Chrome
DevTools MCP (`mcp__chrome-devtools__*`) and records evidence. This folder holds the markdown
**scenario cards** the agent follows, the conventions and macros they share, the regression order and
the master traceability table. The helper scripts live in `scripts/e2e/`.

> Status of this folder: every card is `Status: NOT RUN`. The cards were written from the real
> implementation (service routes, component names, the specs of each change) without a logged-in
> Merchant Center or a deployed service, so selectors and wording may need a correction on the first
> real run. Fix the card, not the chat.

## Prerequisites

- A scratch commercetools project, two Merchant Center users on it (manual step M10): **user A** (its
  user id is in `ADMIN_USER_IDS`) and **user B** (it is not), both with the apps' ordinary permission
  through a Team. A dev API client for the scratch project in `service/.env.local` (manual step M3,
  never printed). The GCP service-account key for the Vertex scenarios (M5).
- The Merchant Center apps registered with their URLs (M6, M9) and, for sandbox runs, a deployed
  connector (change U: `scripts/connect/connect.mjs`).
- Node 22, `cloudflared` (or another tunnel tool) for local runs, Chrome, and the Chrome DevTools MCP.

## Attach to Chrome (manual step M8)

Single sign-on and two-factor login cannot be automated, so the agent attaches to a dedicated Chrome
profile in which each test user has logged in once.

1. Start a second Chrome next to the everyday one (macOS):
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/ai-assistant-e2e-chrome"`.
   Recent Chrome versions refuse the debugging port on the default profile, hence the dedicated
   `--user-data-dir` (to be confirmed with the installed version).
2. In that window log in to Merchant Center as user A and open the scratch project. Repeat with
   `--remote-debugging-port=9223 --user-data-dir="$HOME/.cache/ai-assistant-e2e-chrome-b"` for user B.
3. Point the MCP server at the first browser (`~/.claude.json` or a project `.mcp.json`, then restart
   the Claude Code session, the MCP configuration is read at start):
   `chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222 --redactNetworkHeaders --workspace=<repo>/plans/evidence`.
   Add a second server entry `chrome-devtools-b` with `--browserUrl=http://127.0.0.1:9223` for user B.
   `--redactNetworkHeaders` masks sensitive headers in tool output; `--workspace` lets screenshots and
   snapshots be written below `plans/evidence` (without it the MCP writes only below the OS temp
   directory and `scripts/e2e/collect-evidence.sh` moves the files afterwards).
4. `curl -s http://127.0.0.1:9222/json/version` prints JSON with `Browser`; `E2E-V-01` verifies the
   attachment, the host, the project and the login state at the start of every run.

`--autoConnect` (Chrome 144 or newer) would reuse the everyday profile and expose the owner's other
sessions to the agent, so it is not the default.

## Environments

Copy `e2e/.env.example` to `e2e/.env.e2e` (git-ignored) and fill it in. Only `E2E_ENV` and the base
URLs change between environments; each card says which it supports.

| | Local | Sandbox |
|---|---|---|
| Service | `bash scripts/e2e/dev-up.sh` starts a tunnel (the Merchant Center gateway cannot reach `localhost`), writes the tunnel origin into the audience variable `MC_AUDIENCE`, starts the service on port 8080 | the sandbox deployment of a published connector (`commercetools connect deployment get`), URL from the deployment |
| Apps | `mc-scripts start` in `mc-app`, `composed-apps`, `mc-view-app` (see "Ports" below) | the deployed application URLs registered in Merchant Center |
| Restarts, two instances, reduced budget | possible (`dev-up.sh`, `two-instance.mjs`) | `connect deployment redeploy`, `scripts/connect/connect.mjs configure` |
| Cold start, long turn, deploy checks | not possible | `E2E-V-09`, `E2E-H-04`, `E2E-U-*` |

Ports: the three apps all default to port 3001. `dev-up.sh` runs the app named in `E2E_APPS`
(`mc-app`, `composed-apps` or `mc-view-app`) one at a time because a Custom Application has a single
registered development URL per project; whether `mc-scripts start` accepts a port option was not
verified here.

## Running a tier

`02-regression-order.md` lists the tiers. Typical session:

1. `ATTACH`, then `E2E-V-01` (preflight). If it is `BLOCKED`, stop.
2. Run tier 0, then tier 1 (smoke, about 10 minutes), then the others in order. Two consecutive FAILs of
   the same card stop the tier; destructive tiers run only with `E2E_ALLOW_DESTRUCTIVE=1`.
3. After each card write `result.json`; at the end run `bash scripts/e2e/collect-evidence.sh <run-id>` and
   `node scripts/e2e/cleanup.mjs --run <run-id>`. `collect-evidence.sh` also runs a scrub pass over the
   moved files (tokens, cookies, provider keys, e-mail addresses and deployed or tunnel hosts are
   redacted; a private key block makes it refuse with exit code 2 and keep nothing).
   Seeds with parameters (`sessions-many`, `large-snapshot`) are described in `fixtures/README.md`.

## Evidence layout

`<evidence-root>/<run-id>/<scenario-id>/` holds `snapshot-final.txt`, `screenshot-final.png`,
`network.json`, `console.txt` and `result.json`; `<evidence-root>/<run-id>/report.md` has one row per
scenario. The evidence root is `plans/evidence` unless `E2E_EVIDENCE_ROOT` is set. The folder is
ignored by version control and is never published (change X).

## Safety rules

Only the scratch project named in `E2E_PROJECT_KEY` is touched; dummy third-party credentials only (set
as Connect configuration, never typed into a browser field); nothing secret is printed or saved; no
Merchant Center permission is edited; destructive scenarios are tagged and gated. Details in
`00-conventions.md` section 6.

## Index

| File | Contents |
|---|---|
| [00-conventions.md](./00-conventions.md) | card format, ids, tags, oracles, LLM rules, selectors, safety |
| [01-macros.md](./01-macros.md) | ATTACH, OPEN-APP, SEND, WAIT-STREAM-DONE, REPLAY-FORWARD, EVIDENCE, ... |
| [02-regression-order.md](./02-regression-order.md) | tiers, stop rules, time estimates |
| [03-traceability.md](./03-traceability.md) | every KEEP/CHANGE feature of `plans/01-source-inventory.md` mapped to scenario ids |
| [C-foundation.md](./C-foundation.md) | service status, error shape, fail-fast configuration |
| [D-auth.md](./D-auth.md) | session bootstrap, verifier negatives, admin matrix, dev bypass guard |
| [E-persistence.md](./E-persistence.md) | Custom Object containers, encryption, settings concurrency, delete cascade |
| [F-llm.md](./F-llm.md) | Vertex smoke, bad service-account key, token usage |
| [G-sessions.md](./G-sessions.md) | sessions, digest, suggestions, tools menu, settings endpoints |
| [H-chat-stream.md](./H-chat-stream.md) | stream structure, tools, budget, abort, errors, annotations |
| [I-identity-mcp.md](./I-identity-mcp.md) | identity MCP binding, connect, disconnect, replay |
| [J-tool-sources.md](./J-tool-sources.md) | Knowledge MCP, provider status, Algolia, Stripe |
| [K-nimbus.md](./K-nimbus.md) | embedded Nimbus readiness, UI agent, respawn |
| [L-bigquery-gcs.md](./L-bigquery-gcs.md) | BigQuery offload, SQL guard, export, private images |
| [M-composed-pages.md](./M-composed-pages.md) | composed page tool, versions, hooks, storage |
| [N-feedback-backoffice.md](./N-feedback-backoffice.md) | feedback, large snapshots, backoffice API |
| [O-foundation.md](./O-foundation.md) | frontend bootstrap, request shape, CSP, reauth gate |
| [P-mc-app-chat.md](./P-mc-app-chat.md) | chat surface of `mc-app` |
| [Q-mc-app-admin.md](./Q-mc-app-admin.md) | binding, settings, backoffice UI, forged label |
| [R-composed-apps.md](./R-composed-apps.md) | the composed pages app |
| [S-mc-view-app.md](./S-mc-view-app.md) | the custom view panel |
| [U-deployment.md](./U-deployment.md) | deployed apps, two-phase deploy, idempotent redeploy, undeploy |
| [V-cross-cutting.md](./V-cross-cutting.md) | preflight, auth failure, non-admin, restart, multi-instance, budget, secrets |

## FAQ

- **The login was lost during a run.** Log in again in the dedicated profile and re-run the preflight;
  the run records `BLOCKED(M8)` for the affected cards.
- **The tunnel URL changed.** Stop everything, run `dev-down.sh`, then `dev-up.sh`: the audience variable
  and the apps' service endpoint are rewritten and the apps restarted.
- **A tool refuses to write a file.** The MCP writes only to the OS temp directory unless `--workspace`
  allows another root; write to `$TMPDIR/e2e/<run-id>/` and run `collect-evidence.sh`.
- **Where is the service log?** Local: the console of `dev-up.sh` (`.e2e-service.log`). Sandbox:
  `commercetools connect deployment logs`.
- **Can I run one card alone?** Yes, after `ATTACH` and the preflight; the card's `Pre` lists the state it
  needs.
