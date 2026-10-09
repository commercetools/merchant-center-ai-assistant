## Context

Change Z (`z-release-verification`), wave 11, needs X (and T if unblocked). It is the acceptance gate for requirement R10 ("plan so a junior developer can pick up any spec") and the closing proof for R1 to R9. Read `plans/00-overview.md` (requirements), `plans/03-spec-dependency-map.md` (the A to Z table), `plans/manual-steps.md` (M1, M2, M4, M12, M13, M15) and the Connect skill `SKILL.md` section "Production-readiness checklist (the gate)".

## Explore findings

1. **The gate comes from the skill.** `commercetools-connect/SKILL.md` lines 168-200 define 20 checklist boxes in five groups (Reliability 4, Security 4, Correctness 5, Observability 2, Operations 4 - counted from the file) and states "A connector is not done until every applicable item holds". `references/deployment-installation.md` Checklist adds 11 boxes (validate before staging, descriptions on every key, least-privilege scopes, same region, redeploy not recreate, live-contract check, verify deploy success from `deployment logs` and the registered resource, partial-merge redeploy semantics, full code-update chain, README contents, certification only for public listing). `references/merchant-center-customizations.md` Checklist adds app-vs-view choice, placeholders, local test including a permission-denied path. `references/project-structure.md` Checklist adds "Shared code in a single `shared/` workspace (multi-app connectors)".
2. **This connector is service-plus-frontends only.** `plans/02-target-architecture.md` section 2: `service` (type `service`, endpoint `/service`) and three Merchant Center applications; no `event` or `job` application, no Subscription, no API Extension. The event-oriented checklist boxes are therefore not applicable, and the proof of non-applicability is an empty `GET /{projectKey}/extensions` and `/subscriptions` on the deployment (to be run in task 4.2), plus `connect.yaml` having no `event`/`job` entries.
3. **Documented exception to the `shared/` box.** Merchant Center application builds only transpile `sourceFolders` of each app (`node_modules/@commercetools-frontend/mc-scripts/dist/create-webpack-config-for-production-*.esm.js` lines 370, 400, 481 in the legacy install), so frontend shared code is duplicated and guarded by `scripts/check-duplicates.mjs` (changes O, R, S). The service folder is a single backend application so `shared/` is not needed. Z records this as PASS-WITH-EXCEPTION with a link to the README paragraph (change W).
4. **Release mechanics from change U/X** (read from their artefacts on 2026-10-08): Connect stages a connector from a git URL plus tag (`connectorstaged create --repository-url --repository-tag`), sandbox deployments require a published connector, `redeploy` merges configuration partially and `--updateConnector` moves to the latest published version (change U design E1-E3); the repository must be public before M13 tags it; rehearsals use a private staging repository (M15). The release tag chosen by the manual-steps amendments is `v0.1.0` (M13 refine).
5. **Open items already known** (from the "Open questions" sections read on 2026-10-08) - seed for the register: C Q-C1 (PORT injection), Q-C2 (25 MB body through Connect ingress), Q-C3 (SDK major bump); D Q-D2 (entry-point path), Q-D3 and the U10 comma-list check for `ADMIN_USER_IDS`; E Q-E1 (credentials in Custom Objects vs secured config), Q-E3 (container charset probe), Q-E5 (display-only `userLabel`; retention Q13/Q25 is decided: kept forever); G OQ-G1..G5; H OQ-H1..H6 (stream timeout below 5 min, budget numbers, continue chip); I OQ-I1 (scope `mcp:` for DCR client), OQ-I2 (refresh rotation), OQ-I3..I6; J OQ-J1..J6; K OQ-K1 (embed viability in sandbox), OQ-K2 (Nimbus version), OQ-K5 (spawn command in Connect image); N OQ-N1..N5 (body limit end-to-end, admin transcript access); O Q-O1..Q-O5 (scope trim, yarn vs npm in Connect, view `connect.yaml` keys); P Q-P1..P6 (Gravatar, tool-call-logs initial mode); Q Q-Q2..Q5; R RQ4, RQ5; S RQ6, RQ7; T blocked on Q1; V RQ8, RQ9; W RQ10, RQ11; plus owner questions Q1-Q16 in `plans/owner-questions.md`.
6. **Backlog items already named:** plan 05 "optional `RETENTION_DAYS` job (Connect `job` application) listed as a future spec" (owner decision Q13/Q25: messages and feedback are kept forever, so the job is built only if the owner reverses that decision); change I proposal "Forward-to JWT exchange for an MCP token - proven impossible (auth2 does not advertise `jwt-bearer`)"; change E R6 "retention job later" (cascade delete of long sessions); change N R-N1 orphan feedback chunks; plan 03 "Letter `Y` ... reserved for a post-v1 follow-up".
7. **No automated aggregation exists today.** Archive state is available from `openspec list --json` and the directory `openspec/changes/archive/`; task shape can be linted by headings; scenario results live in `plans/evidence/<run-id>/report.md` (change V).

## Glossary

- **Acceptance table**: the A to Z table with evidence per change.
- **Readiness checklist**: the Connect production-readiness boxes with proof.
- **NOT APPLICABLE**: a box that cannot apply to this connector, with a verifiable reason.
- **PASS-WITH-EXCEPTION**: a box satisfied by a documented, accepted alternative.
- **Open-items register**: all unresolved items with owner and decision.
- **ConnectorStaged / Connector**: private staged connector from a git tag / published read-only version (change U glossary).
- **Anonymous clone**: a clone of the public repository without credentials.
- **Blocks release**: item whose resolution is required before tagging.

## Source map

| Source | New artefact | Verdict |
|---|---|---|
| `plans/03-spec-dependency-map.md` table | `plans/evidence/z/acceptance.md` (generated) | NEW |
| Connect skill checklists | `plans/evidence/z/readiness.md` | NEW |
| `plans/00-overview.md` R1-R10 | `plans/evidence/z/requirements-trace.md` | NEW |
| all designs "Open questions" | `plans/evidence/z/open-items.md` | NEW |
| plan 05, change I/E/N notes | `plans/evidence/z/backlog.md` | NEW |
| change U/X procedures | `plans/evidence/z/release-log.md` | NEW |
| all W docs | `plans/evidence/z/handover.md` | NEW |
| none | `scripts/release/acceptance.mjs`, `scripts/release/check-tasks-shape.mjs` (public, headered) | NEW |

### A to Z acceptance table (evidence required)

| ID | Change | Needs | Evidence required (record command, exit code, ids, artefact) |
|---|---|---|---|
| A | `a-repo-bootstrap-labs-compliance` | - | `node scripts/spdx-check.mjs` and `node scripts/check-repo-rules.mjs` exit 0; `node --test scripts/tests`; LICENSE, SUPPORT.md, CONTRIBUTING.md, README banner present |
| B | `b-connect-skeleton` | A | `commercetools connect validate` exit 0; four app folders; `connect.yaml` keys documented |
| C | `c-service-foundation` | B | `cd service && npm run build && npm test`; E2E-C-01, E2E-C-02; `/service/status` UP on sandbox |
| D | `d-mc-session-auth` | C | service tests; E2E-D-01..D-05, E2E-V-02, E2E-V-03, E2E-V-12, E2E-V-13; admin resolution by `ADMIN_USER_IDS` proven for the admin user and the non-admin user |
| E | `e-persistence-custom-objects` | C | tests incl. memory and Custom Object contract; E2E-E-01..E-03, E2E-V-04; probe of limits recorded |
| F | `f-gcp-credentials-and-vertex-llm` | C | tests; live smoke (skipped without secrets, then run on sandbox); E2E-F-01..F-03 |
| G | `g-chat-sessions-and-digest` | D,E,F | tests; E2E-G-01..G-08 |
| H | `h-agents-and-chat-stream` | D,E,F,G | tests; E2E-H-01..H-06, E2E-V-06, long-turn measurement OQ-H2 recorded |
| I | `i-identity-managed-mcp` | D,E,H | tests; E2E-I-01..I-07, E2E-V-05; OQ-I1/I2 outcomes recorded |
| J | `j-third-party-tool-sources` | C,H,D | tests; E2E-J-01..J-06 (secret-dependent ones executed or SKIPPED with reason) |
| K | `k-nimbus-mcp-embedded` | H | tests; E2E-K-01..K-03; sandbox embed viability (OQ-K1) recorded |
| L | `l-bigquery-and-gcs` | F,H | tests; E2E-L-01..L-05 |
| M | `m-composed-pages` | H | tests; E2E-M-01..M-03 |
| N | `n-feedback-and-backoffice-api` | D,E,G | tests; E2E-N-01..N-04; end-to-end body limit measured |
| O | `o-frontend-foundation` | B,D | `node scripts/check-versions.mjs`, `check-duplicates.mjs`, `check-frontend-leftovers.mjs`; E2E-O-01..O-05 |
| P | `p-mc-app-chat-surface` | O,G,H | typecheck, lint, build; E2E-P-01..P-14 |
| Q | `q-mc-app-admin-surfaces` | O,I,J,N,P | typecheck, lint, build; E2E-Q-01..Q-06 |
| R | `r-composed-apps-app` | O,M | typecheck, lint, test, build; E2E-R-01..R-09 |
| S | `s-mc-view-app` | O,P | typecheck, lint, test, build; E2E-S-01..S-10 |
| U | `u-connect-deployment-no-gha` | B,C,O | `node --test scripts/tests/connect-*.test.mjs`; sandbox deployment created by scripts; E2E-U-01..U-04 |
| V | `v-e2e-chrome-testing` | U + feature specs | `extract-scenario-ids.mjs --lint --dangling --trace` exit 0; full `report.md` without FAIL |
| W | `w-docs-and-readmes` | C-S, U | `scripts/docs/*` checks exit 0; four READMEs; FEATURES regenerated |
| X | `x-labs-publication-gate` | W,V | gate prints CLEAR; anonymous clone proof; single commit; no `.github/workflows` |
| Z | `z-release-verification` | X | this change's own tasks complete |
| Y | reserved | - | unused by design; mention in handover |

### Production-readiness checklist applied (status and proof)

| Group | Item (skill wording abbreviated) | Expected status | Proof |
|---|---|---|---|
| Reliability | Idempotency stated and implemented statelessly | NOT APPLICABLE for events; PASS for service writes (keyed Custom Object upserts, single-use PKCE state) | README statement; E tests; E2E-V-05 |
| Reliability | Redelivery-safe responses | NOT APPLICABLE (no Subscription) | empty subscriptions list (task 4.2) |
| Reliability | Re-fetch by ID, do not trust payload | NOT APPLICABLE | same |
| Reliability | Hot-path work minimised (sync) | NOT APPLICABLE (no API Extension) | empty extensions list |
| Security | Inbound endpoints authenticated | PASS (gateway-signed JWT verified on every route, `/status` open) | D tests, E2E-D-02, E2E-V-02 |
| Security | Least-privilege scopes | PASS | `connect.yaml` scopes vs docs scope table (`gen-config-table.mjs --check`), no `manage_project` |
| Security | Secrets in `securedConfiguration` | PASS | `connect.yaml` review; leak check (X); E2E-V-10 |
| Security | No stack traces or secrets in responses | PASS | E2E-C-01, E2E-V-02 part A, error middleware test |
| Correctness | Envelope validation | NOT APPLICABLE | no events |
| Correctness | Message-type filtering | NOT APPLICABLE | no events |
| Correctness | Self-change filtering | NOT APPLICABLE | no events |
| Correctness | Route path matches `endpoint` | PASS | `/service` mount; E2E-U-01 `/service/status` through deployment URL |
| Correctness | Pinned SDK and client versions | PASS | `grep` of `service/package.json` for `@commercetools/platform-sdk ^8`, `ts-client ^4`; typecheck |
| Observability | Structured logs with correlation ids | PASS | C tests; sample of deployment logs (`deployment logs`) showing JSON with correlation id |
| Observability | Health endpoint | PASS | E2E-C-01, E2E-U-01 |
| Operations | Idempotent lifecycle scripts | PASS | U tests; E2E-U-03 (two redeploys) |
| Operations | Deploy-time dependency validation | PASS | postDeploy verifies SA parse, Vertex reachability, Custom Object write (plans/02 section 2); deployment log evidence |
| Operations | Fail-open vs fail-closed documented | PASS | README and `docs/operations.md` table, verified by W task 6.1 |
| Operations | Poison-message/replay runbook | NOT APPLICABLE with statement | README "Poison messages and replay" |
| Deployment | `connect validate` passes before staging | PASS | command output |
| Deployment | Every key has a description, sensible defaults, secrets secured | PASS | `gen-config-table.mjs` output has no empty description |
| Deployment | Same region as target project | PASS | deployment region equals project region (recorded) |
| Deployment | Redeploy not delete/recreate; partial-merge semantics understood | PASS | U runbook; redeploy log |
| Deployment | Config verified against the live connector contract | PASS | `GET /connectors/key=...` output compared with `connect.yaml` |
| Deployment | Deploy success verified from logs and the registered resource, not status alone | PASS | `deployment logs` excerpt plus resource check |
| Deployment | Code update chain (tag -> setRepository -> publish -> redeploy updateConnector) | PASS | release-log of the v0.1.0 rehearsal |
| Deployment | Connector README documents stance, scopes, config table, poison/replay | PASS | `check-docs-claims.mjs --certify` |
| Deployment | Certification reviewed for public listing | PASS-WITH-DEFER | Q14 default: private connector; backlog item |
| Customizations | App vs view chosen deliberately | PASS | proposal R/S, connect.yaml types |
| Customizations | Config uses `${env:...}` placeholders, no hard-coded per-project values | PASS | grep in the three config files; leak check |
| Customizations | Run and tested locally incl. the non-admin (non-allowlisted user) path | PASS | E2E-O-03, E2E-V-03, E2E-V-12 |
| Security | Administrator access is decided only by the user id in `ADMIN_USER_IDS` (fail closed when empty); no permission group exists | PASS | `ADMIN_USER_IDS` present in the staging deployment configuration; E2E-V-13 bootstrap (own user ID line, `configure`, refresh) makes the admin user an admin and not the non-admin user; the permission list of every registered app has only the default View/Manage pair and no assistant-admin group; E2E-V-12 |
| Structure | Shared code in `shared/` | PASS-WITH-EXCEPTION | frontend duplication guard (finding 3) |

### Requirements R1 to R10 trace (initial mapping)

| R | Requirement | Evidence |
|---|---|---|
| R1 | All features except multi-tenancy | traceability lint (change V `--trace`), regenerated `FEATURES.md`, plans/01 verdict review |
| R2 | One Connect connector following the skill | `commercetools connect validate`, readiness table, sandbox deployment of all four apps |
| R4 | No "cms" | gate leak/word scan (X), grep in `package.json` files for the old package name, T scope note |
| R5 | Labs publication rules | gate `CLEAR`, SPDX check, banner x3, names `@commercetools-labs/*`, single commit |
| R6 | No GitHub Actions | `find . -path ./node_modules -prune -o -name workflows -print` empty, `check-repo-rules.mjs` |
| R7 | Firestore dropped, Custom Objects only | E2E-V-04, `grep -ril firestore service` empty, `docs/architecture.md` data model |
| R8 | Base64 service-account JSON | F tests, E2E-F-01/F-02, deployment postDeploy log |
| R9 | Agent tests, not the owner | V report, run on sandbox, evidence tree |
| R10 | Junior-friendly plans | `scripts/release/check-tasks-shape.mjs` over archived tasks, plus a sampling review |

## Decisions

**D1. Evidence lives in `plans/evidence/z/` (internal) and is summarised in the final report; only helper scripts are public.** Alternatives: publish the acceptance report - rejected (contains environment details); skip evidence files - rejected (Z would be unverifiable).

**D2. Version 0.1.0, tag `v0.1.0`.** The product is a first labs release of a migrated codebase; semver 0.x signals instability and matches the unsupported status. Alternative 1.0.0 - rejected (implies stability). All four `package.json` versions are set by W/Z task 5.1 and verified by `acceptance.mjs --versions`.

**D3. Release order.** (1) X prepares the single commit and the gate says CLEAR in the private copy; (2) owner creates the public repository (M1, M2) and approves (M12); (3) push the single commit; (4) tag `v0.1.0` on the public repo (M13) only after CLEAR; (5) anonymous clone proof; (6) `connectorstaged create` against the public URL and tag; (7) publish; (8) sandbox deployment from the published connector; (9) full E2E regression; (10) acceptance report. Rehearsal first on a private staging repository (M15) so the real tag is created once. Alternative: tag before the sandbox run - rejected (a failing regression would require a new tag).

**D4. Rollback.** Documented as: redeploy previous tag (`setRepository` + `publish` + `redeploy --updateConnector`), delete deployment if needed, Custom Objects remain (containers prefixed `ai-assistant-`) and can be removed with the cleanup script in an emergency; rehearsal recorded.

**D5. "Blocks release" classification**: an open item blocks if it (a) makes a readiness box FAIL, (b) leaves a requirement R1-R10 without evidence, (c) is a security question, (d) is a known data-loss bug. Everything else gets a target (v0.1.x or backlog).

**D6. Post-v1 backlog (initial, with size)**: (1) optional retention job for messages/feedback (`RETENTION_DAYS`, Connect `job`, size M; NOT planned: messages and feedback are kept forever by decision Q13/Q25, built only if the owner reverses it); (2) identity token exchange via jwt-bearer if auth2 starts advertising it (S, watch); (3) public marketplace certification (M); (4) Lighthouse/accessibility pass for the three UIs (M); (5) load and soak testing of the SSE stream and Custom Object limits (M); (6) shared frontend package or Connect support for `shared/` in MC apps (L, only if platform allows); (8) additional locators for the Custom View (S); (9) internationalisation (M, Q15); (10) metrics and alerting for the service (M); (11) cascade-delete job for very long sessions and orphan feedback chunk sweeper (S-M); (12) option to move third-party credentials to `securedConfiguration` (Q4 alternative, S); (13) admin audit trail stored in Custom Objects (N NQ1, M); (14) multi-project installation guidance (documentation only, S); (15) the reserved change letter `Y` for a follow-up spec.

**D7. Automation.** `acceptance.mjs` (read archive directory, parse each `tasks.md` Verification section for command and scenario ids, read `report.md`) generates `acceptance.md` but never marks PASS by itself: a human or agent supplies the evidence links; the script verifies the links exist. `check-tasks-shape.mjs` verifies headings only (shape), not quality.

## Risks / Trade-offs

- **R1 Late failures** (sandbox viability of embedded Nimbus, auth2 scope, body limits) surface only in Z. Mitigation: the open-items register lists them first; tasks 3.x schedule their verification before the full regression.
- **R2 Tag immutability**: a wrong public tag forces a new version. Mitigation: rehearsal on the private staging repo (D3).
- **R3 Evidence rot**: `plans/evidence/` is not part of the published tree (git-ignored, see change X); internal evidence must be archived outside git by the owner (handover item).
- **R4 Owner availability** for M1/M2/M12/M13: batch the requests into one message.
- **R5 Checklist drift** if the skill changes: record the skill version path/date used (cache 0.47.0 observed in `~/.claude/plugins/cache/commercetools/commercetools/`).
- **R6 Overstating PASS**: PASS requires an artefact; "looks fine" is not evidence.

## Open questions

- RQ12 (owner, recorded in `plans/owner-questions.md`): version number and tag name (default `0.1.0` / `v0.1.0`) and whether the first release should be certified publicly (Q14 default: private connector).
- RQ13 (owner): where should the internal evidence archive be stored after publication (default: a private archive of the development repository)?
- Does X provide `--ack` records for gate WARNs that must be listed in the register? (read X's archive)

## Changelog

- 2026-10-09 (owner decision Q4): change J now needs C, H, D (no persistence of provider credentials); handover notes describe provider keys as Connect configuration.
- 2026-10-09 (owner decision Q9): acceptance for L now includes the private-image checks (E2E-L-05 in V's numbering: direct bucket URL 403, other user 404); the first sandbox deployment also proves the dataset/bucket bootstrap or its actionable warning (`post-deploy: gcp analytics:`).
- 2026-10-09 (owner decision: admin = `ADMIN_USER_IDS` only, Q12/Q46): release verification checks that `ADMIN_USER_IDS` is configured with user A's id only in the staging deployment, rehearses the user-id bootstrap and the admin and non-admin users (E2E-V-03, V-12, V-13), and checks that no assistant-admin permission group exists in the registered apps' permission lists; the admin sign-in probe and its open items are removed (U10 comma-list check added to the sandbox findings); readiness table gains an administrator-access row; `plans/` and `openspec/` are published as scrubbed design documentation (scrub owned by change X), only `plans/evidence/` stays unpublished.
