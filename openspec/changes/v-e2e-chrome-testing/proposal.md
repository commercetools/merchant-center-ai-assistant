## Why

Requirement **R9**: the owner must not have to test anything; an agent proves every feature in a real browser with the **Chrome DevTools MCP** (tools `mcp__chrome-devtools__*`). Change **V** (`v-e2e-chrome-testing`) builds the testing framework and the playbooks that every feature spec points at ("Chrome scenario ids required: E2E-x-nn"): a scenario format, stable ids, one markdown playbook per feature spec under `e2e/`, fixtures and cleanup, evidence capture, how to attach to a logged-in Chrome (manual step M8), how to run against local development and the deployed sandbox, a regression order, rules for non-deterministic LLM output, and a master traceability table proving that every KEEP feature of `plans/01-source-inventory.md` has at least one scenario.

- Change ID: **V** (`v-e2e-chrome-testing`). Wave 8, size L.
- Needs: **U** (deployment scripts, for the sandbox runs) and all feature specs **G-S** (D, E, F also contribute scenarios). Scenario ids already defined inside other changes win; V reconciles instead of renaming.
- Unblocks: **W** (docs reference the playbooks), **X** (the publication gate runs after V passes), **Z** (acceptance evidence).

## What Changes

- New top-level folder `e2e/` (kept in the public repo): `README.md`, `00-conventions.md`, `01-macros.md`, `02-regression-order.md`, `03-traceability.md`, one playbook per feature spec (`C-foundation.md`, `D-auth.md`, `E-persistence.md`, `F-llm.md`, `G-sessions.md`, `H-chat-stream.md`, `I-identity-mcp.md`, `J-tool-sources.md`, `K-nimbus.md`, `L-bigquery-gcs.md`, `M-composed-pages.md`, `N-feedback-backoffice.md`, `O-foundation.md`, `P-mc-app-chat.md`, `Q-mc-app-admin.md`, `R-composed-apps.md`, `S-mc-view-app.md`, `U-deployment.md`, `V-cross-cutting.md`) and `fixtures/`.
- New helper scripts `scripts/e2e/` (Node, no extra services): `seed.mjs`, `cleanup.mjs`, `ledger.mjs`, `extract-scenario-ids.mjs` (traceability lint), `dev-up.sh` / `dev-down.sh`, `two-instance.mjs` (round-robin / path-pinned proxy for multi-instance tests), `collect-evidence.sh`.
- Cross-cutting scenarios owned by V (ids `E2E-V-01 .. E2E-V-13`): attach/preflight, authentication failure, non-allowlisted (non-admin) user, session persistence across service restart, multi-instance safety (PKCE state), 5-minute budget behaviour, fixture cleanup, service test gates, scale-to-zero cold start, secrets never reach the browser, dropped features absent, forged e-mail, label or header never grants admin, own user ID and administrator bootstrap through `ADMIN_USER_IDS`.
- A master traceability table (every KEEP row of `plans/01` to at least one scenario id) with a lint that fails when an id does not exist.
- Plan amendments requested from other changes (test hooks `data-testid`, instance id in `/service/status`, configurable stream budget) recorded in the plan amendments log (`plans/06-amendments-applied.md`).

## Capabilities

### New Capabilities
- `e2e-chrome-testing`: scenario format and ids, playbooks, environments, evidence, fixtures, flake rules, cross-cutting scenarios, traceability and regression order for agent-run end-to-end tests.

### Modified Capabilities
<!-- none -->

## Impact

- Adds `e2e/` and `scripts/e2e/` (no production code). Needs `service/.env.local` (M3), logged-in Chrome (M8), Connect login (M4) for sandbox runs, two Merchant Center test users on the scratch project (manual step M10: user A whose user id is in `ADMIN_USER_IDS` and user B whose id is not; both have the app's ordinary View/Manage permission through a Team) and a second scratch project (optional). The dedicated Chrome profile is logged in once per user (one profile directory per user).
- Evidence goes to `plans/evidence/<run-id>/` (git-ignored; removed from the published commit with `plans/` per Q16). The `e2e/` folder stays public and must pass the scrub rules.
- Requests small, optional hooks from P/Q/S/H/C (see plan amendments) but does not block on them: scenarios fall back to accessible-name selectors from `take_snapshot`.

## Out of scope

- Unit/wire tests (owned by each spec; V only runs them as a gate, E2E-V-08).
- Performance/load testing, accessibility audits and Lighthouse runs (listed as post-v1 backlog in change Z).
- Cross-browser testing (Chrome only).
- Testing against any non-scratch project or production Merchant Center.
- Implementing the features under test.

## Legacy source

No legacy E2E suite exists (`FEATURES.md` of the chat app: "There are no frontend tests in any package"). Facts reused:
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md` (feature inventory, error gates, session bootstrap)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/FEATURES.md` and `ARCHITECTURE.md` (stream behaviour, PKCE state, digest)
- Scenario ids and steps already written in `openspec/changes/{g,i,o,p}-*/tasks.md`.
