## Why

Change **W** (`w-docs-and-readmes`, wave 9) writes everything a stranger needs to understand, install, operate and contribute to the connector, and everything the commercetools Connect certification review reads: a root README that is the connector README (fail-open/closed stance, required scopes, configuration table, poison/replay statement), per-app READMEs, architecture, how-it-works, REST API reference, configuration reference (every `connect.yaml` key), deployment guide, troubleshooting, permissions, security, SUPPORT and CONTRIBUTING, and a regenerated `FEATURES.md`. The legacy documents are internal, demo-framed and out of date (`FEATURES.md` still describes an outdated permission scheme, Team MCP and Firestore; `ARCHITECTURE.md` and `docs/how-to-present.md` are presentation material). Every earlier change recorded a "Docs to update" list; W consumes all of them so no fact is lost.

- Change ID: **W** (`w-docs-and-readmes`). Wave 9, size M.
- Needs: **C-S and U** (all feature changes and the deployment change implemented and archived, so docs describe real behaviour). T only if unblocked.
- Unblocks: **X** (publication gate scans the docs), **Z** (final acceptance).

## What Changes

- Write or regenerate (under the repository root): `README.md` (banner kept verbatim from change A), `docs/architecture.md`, `docs/how-it-works.md`, `docs/api.md`, `docs/configuration.md`, `docs/deployment.md` (front page; commands stay in change U's `docs/deployment-runbook.md`), `docs/permissions.md` (app access and administrator access), `docs/security.md`, `docs/operations.md`, `docs/troubleshooting.md`, `docs/privacy.md`, `SUPPORT.md` (extended), `CONTRIBUTING.md` (extended), `FEATURES.md` (regenerated from code), `CHANGELOG.md` (one entry).
- Write per-app READMEs: `service/README.md`, `mc-app/README.md`, merge in `composed-apps/README.md` (from R) and `mc-view-app/README.md` (from S) without rewriting them.
- Add documentation tooling in `scripts/docs/`: `gen-config-table.mjs` (generates the configuration tables from `connect.yaml` and the service config registry, with `--check` for drift), `check-links.mjs` (relative links and anchors), `check-api-doc.mjs` (REST routes in code versus `docs/api.md`), `check-docs-claims.mjs` (statements that must appear: fail-open/closed table, scopes table, poison/replay statement, three "unsupported" notices).
- Apply scrub rules (no demo framing, no internal documents, no internal hostnames, no tenant vocabulary) and run the repository prose check from change A.
- Document the administrator model: the `ADMIN_USER_IDS` allowlist, how to find your own user id ("Your user ID" line) and bootstrap the first administrator, fail-closed behaviour when the list is empty, the non-admin experience, what is NOT trusted (any e-mail, label or flag sent by the browser), the display-only `userLabel`, and that the former Merchant Center permission group is REMOVED (none exists); add the data-retention statement (messages and feedback are kept until an operator deletes them; no automatic deletion).
- Provide a docs input ledger mapping every earlier change's "Docs to update" bullet to the section that absorbs it.

## Capabilities

### New Capabilities
- `project-documentation`: required documents, their mandatory content, the Connect certification README contract, generated-and-checked tables, scrub rules and verification checks.

### Modified Capabilities
<!-- none -->

## Impact

- New and rewritten Markdown files plus four small Node scripts; no production code changes. Screenshots come from `plans/evidence/` (change V) and are copied to `docs/images/` after a privacy review.
- `plans/` and `openspec/` are published as scrubbed design documentation (Q16, scrub owned by change X); user-facing documents still do not link into them, so they stand alone.
- Some "Docs to update" bullets reference ids or file names that may have changed during implementation (for example `docs/deployment-runbook.md`); W reconciles against the real tree.

## Out of scope

- Writing or changing source code, `connect.yaml` or tests (other than the four documentation scripts).
- Marketing material, slide decks, demo scripts or presentation documents (the legacy `docs/how-to-present.md` and `docs/demo-script.md` are not carried over).
- Translating documentation.
- The Connect marketplace listing text and certification submission (post-v1 backlog, change Z).
- Publishing (change X).

## Legacy source

- `/Users/behnam/code/multitenant-ai-assistant/multitenant-chat-app/FEATURES.md`, `README.md`, per-app `README.md` (starter text, discarded)
- `/Users/behnam/code/multitenant-ai-assistant/multitenant-ai-assistant-router/FEATURES.md`, `ARCHITECTURE.md`, `docs/how-it-works.md`, `docs/models.md`, `docs/upstream/*` (candidate for scrubbed reuse), `docs/agentation-preview-annotations-plan.md`
- Not carried over: `docs/how-to-present.md`, `docs/demo-script.md`, `ULTRA_PLAN.md`, `docs/frontend-tools-proposal.md`
