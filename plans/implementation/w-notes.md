# Change W (w-docs-and-readmes): implementation notes

## Summary

Branch `worktree-agent-aa00e140fda90da82` (reset to `develop` `c33108b` first: A-S, U and the integration cleanup). Everything in `tasks.md` is done and ticked except 0.4 (legacy documents were not read; every fact comes from the code and the
implementation notes), 1.1 (branch is the harness branch) and 7.4 (screenshots, optional; there is no evidence folder in this tree).

Written, all derived from the code of this tree:

- `README.md` (banner kept verbatim, then the certification sections), `docs/{architecture,how-it-works,api,configuration,deployment,permissions,security,operations,troubleshooting,privacy}.md`, `FEATURES.md`, `CHANGELOG.md`, extended `SUPPORT.md` and `CONTRIBUTING.md`.
- `service/README.md` (replaces the temporary `service/README.dev.md`, deleted), `mc-app/README.md`; `composed-apps/README.md` and `mc-view-app/README.md` only got a link footer plus the removal of three internal step references ("manual step M6/M7", "change H").
- `scripts/docs/`: `gen-config-table.mjs`, `check-links.mjs`, `check-api-doc.mjs`, `check-docs-claims.mjs`, a small `lib.mjs`, and four test files (31 tests). New input file `docs/scope-reasons.json` (reason column of the scope tables).
- Generated blocks (`<!-- gen:begin config -->`, `<!-- gen:begin scopes -->`) in `README.md` and `docs/configuration.md`. The scope block reads `connect.yaml` and the `oAuthScopes` of the three application config files, so a scope change makes `--check` fail.

Commands run in this worktree (all exit 0):

- `node scripts/docs/gen-config-table.mjs --check README.md docs/configuration.md` -> ok
- `node scripts/docs/check-links.mjs` -> ok (20 files); `node scripts/docs/check-api-doc.mjs` -> ok (37 routes)
- `node scripts/docs/check-docs-claims.mjs --certify --citations --scrub --stale` -> ok
- `node --test scripts/tests/*.test.mjs scripts/docs/*.test.mjs` -> 145 pass, 0 fail
- `node scripts/spdx-check.mjs`, `node scripts/check-repo-rules.mjs` (also `--prose`), `node scripts/check-connect-layout.mjs` -> ok; `check-repo-rules.mjs --docs` reports only findings inside `plans/` and `openspec/` (not blocking in development)
- `grep -c "commercetools connect " docs/deployment.md` -> 0; `head -15 README.md | grep -ci unsupported` -> 2; no `*/README.md` contains "starter".
- README quick start walked for the service: `npm ci`, a `.env.local` with `NODE_ENV=development`, `PERSISTENCE_DRIVER=memory`, `MC_AUTH_DISABLED=true`, `CTP_PROJECT_KEY`, `CTP_REGION`, `ENCRYPTION_KEY`, then `npm run start:dev`: `/service/status` answered `UP`, `GET /service/session/all` with the dev headers answered `{"success":true,"data":[]}`, `PUT /service/system-prompt` without `x-dev-admin` answered 403 `ADMIN_REQUIRED`. The frontend `yarn start` steps were not run (they need a Merchant Center login).

Not run: `openspec validate w-docs-and-readmes --strict` was not part of the brief for this worktree run, and `commercetools connect validate` (no change to `connect.yaml`).

## Questions (for the owner)

1. RQ10: where do discussions happen and how is a vulnerability reported privately? `SUPPORT.md` says "Discussions of this repository, when enabled" and "ask for a private channel". Give the real answer before publication.
2. RQ11: the scrubbed `docs/known-issues/managed-mcp-gemini-schemas.md` was not written (the design said "keep if still accurate"; I did not verify that `json-schema.utils` still needs the note). Keep or drop?
3. Published package names: the repository uses `ai-assistant-<suffix>` (A's checker). Task A asked for a "dev name -> published name" table in the architecture document; I documented only the dev names because the published names are not defined in this tree (change X). Supply the table or confirm that the dev names are the published names.
4. Gravatar: `docs/privacy.md` documents that `mc-app` requests avatars from `gravatar.com` with a hash of the user's e-mail address, and how to remove it. Keep or remove for a v1 release?
5. `mc-app` sends the signed-in user's e-mail address as `userLabel` (`mc-app/src/contexts/session.tsx` lines 125 and 202), and the composed page save stores it as `createdBy`. Both are stored in clear text. The docs say so (privacy and permissions pages). Is that acceptable, or should the label be dropped?
6. `GEMINI_AGENT_MODEL_NAME` is a declared, defaulted key but no code path selects the `agent` tier any more (the orchestrator is flat). Remove the key or keep it reserved? The docs call it reserved.
7. Should `ENCRYPTION_KEY` be changeable through the helper? `configure` refuses it (deploy only), so the rotation procedure in `docs/configuration.md` needs a manual Connect CLI redeploy.

## Documentation gaps (things the code does not do that documents might imply)

- The `agent` model tier is not used by chat (see question 6).
- Keys read by the service but not declared in `connect.yaml` (`PORT`, `NODE_ENV`, `LOG_HTTP`, `CACHE_*`, `MCP_HANDSHAKE_TIMEOUT_MS`, `PERSISTENCE_DRIVER`, `MC_AUTH_DISABLED`) cannot be set on Connect. `docs/configuration.md` says so.
- The deployment helper's `configure` accepts only the provider keys, the Google settings and `ADMIN_USER_IDS`. `LOG_LEVEL`, model names and the chat budget need a manual redeploy with the CLI.
- A running instance keeps the old `ADMIN_USER_IDS` until it restarts; there is no hot reload. Whether the comma-separated value stays one string through the Connect CLI is still the open item U10 of the runbook.
- The correlation id is accepted (`X-Correlation-Id`) but not echoed in the response.
- Deleting a session does not delete its feedback; there is no API to delete feedback or a user's data. Everything else is "delete the Custom Objects yourself".
- The backoffice thread list is ordered by creation time, not last update (from N and E).
- Session lists and the personalised suggestions are limited to 500 sessions and to sessions without the `customView` flag.
- Digest generation and the follow-up chips depend on work after the response closes; whether Connect lets it finish is unverified (R-G1).
- Export supports CSV only. Mutating Stripe calls have no confirmation step.
- `public` image mode only works for a bucket the service creates; an existing private bucket is never changed.
- The fail-open table says the token verification timeout is "set by the verification library": the JWKS timeout and cache lifetime of `@commercetools-backend/express` were not read.
- The app permission names derived by `entryPointUriPathToPermissionKeys` are not spelled out in `docs/permissions.md` (they were never verified in a Merchant Center); the page describes them as the "default View and Manage pair".
- Nothing about deployed behaviour was verified: Docker was not used, no Connect deployment exists, no Chrome scenario ran. The open platform items U1-U10 are in section 11 of `docs/deployment-runbook.md` and `docs/deployment.md` points to them. The 15 s cold start and 15 min deployment times are platform statements, not measurements.
- Model ids (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-image`) were never validated on Vertex AI (F note); `docs/configuration.md` warns that a missing model fails at the first request.
- `docs/troubleshooting.md` has only a generic entry for live browser checks: change V (`e2e/`) is not in this tree, so `CONTRIBUTING.md` and the README cannot link to it.

## TODOs

- Re-read all documents after the first sandbox rehearsal (U1-U10, E2E, `connect validate`) and correct what differs.
- Screenshots (task 7.4): none, there is no evidence folder.
- Add to `docs/how-it-works.md` the analyzer window (10 messages) and the composed page validation caps (20 components, 10 data sources, 20,000 characters); add the export caps (50,000 rows, 5 MB) to `docs/api.md`. These were in the "Docs to update" lists and are only partly absorbed (see the ledger).
- Add the Stripe toolkit note from J (pinned 0.7.12, `legacy-peer-deps`) to `docs/configuration.md` or `service/README.md`.
- Write the "Using the assistant" guide (P) and the "adding a store" developer guide (E); neither was in the task list of W itself.
- Optional: have `gen-config-table.mjs` also generate the table of service keys that are read but not declared (today it is a hand-written paragraph).

## Deviations from the spec (with reason)

- Branch: harness worktree branch instead of `spec/w-docs-and-readmes`.
- Task 1.1 says to stop when a feature change is not archived. `openspec/changes/archive/` is empty in this tree, but the brief said every change is on `develop`, so I documented the code and the implementation notes instead of the plans.
- The docs input ledger lives in this file (below) instead of `plans/evidence/w/ledger.md`, because `plans/evidence/` is git-ignored and would be lost.
- `check-docs-claims.mjs --scrub` also reads `scripts/internal-paths.json` (present in this repository) as well as the `scripts/internal/leak-patterns.json` the design names (absent here; read when present).
- `gen-config-table.mjs` takes the files as positional arguments (as in the task's "Done when" command) and `--root` for tests; `--files` is not needed.
- Tests run with `node --test scripts/docs/*.test.mjs` (a directory argument fails on Node 22, as A and B noted).
- `docs/permissions.md` states that no Merchant Center permission grants administrator rights without using the words the "Done when" greps for (the spec requires both the statement and a zero count of the phrase).
- The README mentions `plans/` and `openspec/` as design documentation in plain text, as change A and X's lists ask, without links (the link check forbids them).
- Small edits outside the new files: `docs/deployment-runbook.md` (one internal step id removed), `service/src/tool-sources/README.md` (change letters replaced), `composed-apps/README.md` and `mc-view-app/README.md` (footer, internal step ids). No code or `connect.yaml` change.
- `docs/deployment.md` omits the manual-step ids (M4, M6, ...) that the task lists, because they are identifiers from a private plan; the order of operations is described by name.

## Docs input ledger

Status: done = absorbed in the named document; partial = absorbed only in part (see TODOs); n/a = describes removed behaviour.

| Source | Bullet | Target | Status |
| --- | --- | --- | --- |
| A | README banner and status | `README.md` | done |
| A | CONTRIBUTING per-folder commands, check commands | `CONTRIBUTING.md` | done |
| A | `.env.example` policy | `docs/configuration.md` "Settings that are not in connect.yaml" | done |
| A | Package-naming table (dev -> published) | `docs/architecture.md` "Applications" | partial (question 3) |
| A | README says `plans/` and `openspec/` are design documentation | `README.md` | done |
| A | X scrub inputs | - | n/a (change X) |
| B | Configuration reference with the seven provider keys | generated block, `docs/configuration.md` "Third-party providers" | done |
| B | README install section | `README.md` "Deployment summary", `docs/deployment.md` | done |
| B | Platform facts PF1-PF8 | `docs/architecture.md` "Deployment flow", `docs/configuration.md` | partial (the facts of the `connect.yaml` header only) |
| B | Scope table | generated block, `README.md` | done |
| B | CONTRIBUTING Docker, npm and yarn | `CONTRIBUTING.md` | done |
| C | Run the service locally | `README.md` "Quick start", `service/README.md` | done (walked) |
| C | Env registry table from `src/config/sections` | `docs/configuration.md` | partial (declared keys generated, others listed) |
| C | Architecture: mount, liveness, fail-fast, two-phase | `docs/architecture.md` | done |
| C | Troubleshooting invalid environment | `docs/troubleshooting.md` | done |
| D | Security model page | `docs/security.md`, `docs/permissions.md` | done |
| D | Configuration rows for auth keys | generated block, `docs/configuration.md` | done |
| D | Runbook two-phase, "all requests 401" | `docs/deployment.md`, `docs/troubleshooting.md` | done |
| D | Admin guide | `docs/permissions.md` | done |
| D | Frontend contract (audience policy, no permissions claim) | `docs/architecture.md` "Authentication flow" | done |
| E | Data model, retention | `docs/architecture.md`, `docs/operations.md` | done |
| E | Scopes warning, key generation, backup, rotation | `docs/security.md`, `docs/configuration.md`, `docs/operations.md` | done |
| E | Troubleshooting 409, 503, 413, session too long | `docs/troubleshooting.md` | done |
| E | Developer guide (memory driver, integration tests, adding a store) | `service/README.md` | partial (no "adding a store") |
| E | Limits table | `docs/architecture.md` (cites `limits.ts`) | partial |
| F | Google Cloud setup guide | `docs/configuration.md` "Google Cloud" | done |
| F | Configuration rows, model tiers | generated block, `docs/configuration.md` "Models" | done |
| F | Location guidance (`us-central1` versus `global`, residency) | - | partial (residency pointer in `docs/privacy.md` only) |
| F | Troubleshooting | `docs/troubleshooting.md` | done |
| F | Architecture: one credential | `docs/architecture.md` "Decisions" | done |
| G | REST rows and envelope | `docs/api.md` | done |
| G | Data flow, digest detached | `docs/how-it-works.md` | done |
| G | FEATURES removals | `FEATURES.md` | done |
| H | SSE row and chunk vocabulary | `docs/api.md` "Chat stream" | done |
| H | Registry diagram, budget timeline, windows | `docs/how-it-works.md`, `docs/architecture.md` | partial (table not diagram; analyzer window missing) |
| H | Budget keys | generated block, `docs/configuration.md` | done |
| H | Tool source guide | `CONTRIBUTING.md`, `service/README.md` | done |
| I | Identity endpoints table | `docs/api.md` | done |
| I | Admin access and identity mode README | `README.md`, `docs/permissions.md`, `docs/how-it-works.md` | done |
| I | Tokens encrypted, refresh race | `docs/how-it-works.md`, `docs/security.md` | done |
| I | Removed knobs | - | n/a |
| J | Providers row, enablement rule, keys | `docs/api.md`, `docs/configuration.md` | done |
| J | Stripe restricted key, toolkit pin note | `docs/security.md` | partial (pin note missing) |
| J | Security notes (prompt injection) | `docs/security.md` | done |
| K | Nimbus child, footprint, kill switch, bump procedure | `docs/how-it-works.md`, `docs/operations.md` | done |
| K | `GET /service/status/nimbus` | `docs/api.md` | done |
| K | Runbook smoke | `service/README.md` | partial |
| L | GCP setup, bucket options | `docs/configuration.md`, `docs/security.md` | done |
| L | Offload pipeline, files route | `docs/how-it-works.md`, `docs/api.md` | done |
| L | Export caps | `docs/api.md` | partial |
| M | Contract, regeneration, validation limits, defence in depth | `docs/how-it-works.md`, `docs/security.md`, `docs/operations.md` | partial (caps not listed) |
| N | Feedback and backoffice rows, 413 policy | `docs/api.md` | done |
| N | Container layout, audit lines, retention | `docs/architecture.md`, `docs/security.md`, `docs/operations.md` | done |
| O | Prerequisites, env table, CSP list | `README.md`, `docs/configuration.md` | done |
| O | Check scripts | `CONTRIBUTING.md` | done |
| P | "Using the assistant" guide with screenshots | - | not done (TODO) |
| P | Annotation contract, Gravatar | `docs/api.md`, `docs/privacy.md` | done |
| P | Motion README | - | not done (file stays in `mc-app/src/motion/`) |
| Q | Setup steps, admin access, security | `docs/deployment.md`, `docs/permissions.md`, `docs/security.md` | done |
| R | Architecture, config, how it works, troubleshooting, scopes | respective documents | done |
| S | Architecture, how it works, config, troubleshooting, locators | respective documents, `mc-view-app/README.md` | done |
| U | README deploy, runbook link, two-phase diagram | `README.md`, `docs/deployment.md`, `docs/architecture.md` | done |
| U | Deployment inputs table, verified-behaviour results | `docs/deployment-runbook.md` (linked) | done (results are open items there) |
| U | No CI by design, secrets in argv | `CONTRIBUTING.md`, `docs/security.md` | done |
| V | E2E troubleshooting, how to add a card, testing layers | `docs/troubleshooting.md`, `CONTRIBUTING.md`, `docs/architecture.md` | partial (V not in this tree) |
| X | README links CONTRIBUTING, no publication toolchain | `README.md` | done |
