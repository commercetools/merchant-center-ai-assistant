# Connect production-readiness checklist: applied status

Checklist sources: the `commercetools-connect` skill (section "Production-readiness checklist (the gate)" and the
references for deployment, Merchant Center customizations and project structure), skill cache observed at version 0.47.0.

Status vocabulary (stricter than the spec, on purpose, because no deployment exists):

- **PASS (local)**: proven by a command, test or file in the repository that was run or read for this change (ids C1-C22 refer to `command-log.md`).
- **NOT APPLICABLE**: the connector has no `event`/`job` application (static proof C18); the live proof (empty `GET /{projectKey}/extensions` and `/subscriptions` for this connector's keys) is **NOT VERIFIED** until a sandbox deployment exists (task 4.2; manual steps M4, M15, M16).
- **PASS-WITH-EXCEPTION**: satisfied by a documented alternative.
- **NOT VERIFIED (Mxx)**: needs the named manual step. This is NOT a pass.
- **FAIL**: none recorded.

Totals: 40 rows. PASS (local) 22, PASS-WITH-EXCEPTION 2, NOT APPLICABLE (static proof only) 7, NOT VERIFIED 9, FAIL 0. A "PASS (local)" row whose evidence column also says NOT VERIFIED has a live half that is not proven. No row is a deployed-behaviour PASS.

| Group | Item | Status | Evidence / blocking step |
|---|---|---|---|
| Reliability | Idempotency stated and implemented statelessly | PASS (local) for service writes; NOT APPLICABLE for events | Keyed Custom Object upserts and single-use state are covered by service tests (C1); README "Poison messages and replay" states there is no event handling. Multi-instance proof E2E-V-05 NOT VERIFIED (M3, M4, M15). Known gap: first write of a never-written object is an upsert (E notes, G-E1). |
| Reliability | Redelivery-safe responses | NOT APPLICABLE | No Subscription (C18). Live empty subscriptions list NOT VERIFIED (M4, M15). |
| Reliability | Re-fetch by ID, do not trust payload | NOT APPLICABLE | Same. |
| Reliability | Hot-path work minimised (sync) | NOT APPLICABLE | No API Extension (C18). Live empty extensions list NOT VERIFIED (M4, M15). |
| Security | Inbound endpoints authenticated | PASS (local) | Gateway-signed JWT verification on every route except `/service/status`: D wire tests with real RS256 tokens and the 11-row rejection matrix (C1). Live E2E-D-02, E2E-V-02 NOT VERIFIED (M8, M10). |
| Security | Least-privilege scopes | PASS (local) | `connect.yaml` scopes are `view_key_value_documents` and `manage_key_value_documents`; no `manage_project` (C19 grep); scope tables generated and checked (C10, `gen-config-table --check`). |
| Security | Secrets in `securedConfiguration` | PASS (local) | `GCP_SA_KEY_BASE64`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_PREVIOUS` and the provider keys are secured keys; layout checker pins the key sets (C9). Leak check on the published tree is change X (not CLEAR yet). E2E-V-10 NOT VERIFIED (M8). |
| Security | No stack traces or secrets in responses | PASS (local) | Error middleware tests (C1). Live E2E-C-01, E2E-V-02 part A NOT VERIFIED (M15). |
| Correctness | Envelope validation | NOT APPLICABLE | No events. |
| Correctness | Message-type filtering | NOT APPLICABLE | No events. |
| Correctness | Self-change filtering | NOT APPLICABLE | No events. |
| Correctness | Route path matches `endpoint` | PASS (local) for the mount; NOT VERIFIED on a deployment | `/service` mount checked by the layout checker and the status wire test (C1, C9). `/service/status` through the deployment URL (E2E-U-01) NOT VERIFIED (M4, M15). |
| Correctness | Pinned SDK and client versions | PASS (local) | C22: `@commercetools/platform-sdk ^8.27.0`, `ts-client ^4.10.0`; typecheck and build pass (C1). |
| Observability | Structured logs with correlation ids | PASS (local) for the code; NOT VERIFIED for a deployment log sample | Logger and correlation id tests (C1). Sample of `deployment logs` NOT VERIFIED (M4, M15). Note: the correlation id is accepted but not echoed in responses (W notes). |
| Observability | Health endpoint | PASS (local) | `/service/status` and `/service/health` wire tests (C1). Deployed E2E-U-01 NOT VERIFIED (M15). |
| Operations | Idempotent lifecycle scripts | PASS (local) for the scripts' unit tests; NOT VERIFIED for two real redeploys | `service/tests/connector/*` and `scripts/tests/connect-*` (C1, C7). E2E-U-03 NOT VERIFIED (M4, M15, M16). |
| Operations | Deploy-time dependency validation | NOT VERIFIED (M4, M5, M15) | `postDeploy` checks exist and are unit-tested; no deployment log shows them. U5/U6 (are the configuration and devDependencies visible to the lifecycle scripts) are open. |
| Operations | Fail-open vs fail-closed documented | PASS (local) | README and `docs/operations.md` "Fail-open and fail-closed behaviour" exist; claims check C11 flagged only unrelated internal-path lines. |
| Operations | Poison-message/replay runbook | NOT APPLICABLE with statement | README "Poison messages and replay" exists. |
| Deployment | `connect validate` passes before staging | NOT VERIFIED (M14) | C17: Docker daemon not running. `commercetools connect application build` and `test` pass (C2). |
| Deployment | Every key has a description, sensible defaults, secrets secured | PASS (local) | `gen-config-table.mjs --check` passes (C10) and fails on drift. Not checked: that the table has no empty description cell beyond what the generator enforces. |
| Deployment | Same region as target project | NOT VERIFIED (M4, M6, M15) | `CTP_REGION` is a required service key; no deployment to compare. |
| Deployment | Redeploy not delete/recreate; partial-merge semantics understood | NOT VERIFIED (M4, M15, M16) | Runbook documents it; U1-U10 table is all `open`. |
| Deployment | Config verified against the live connector contract | NOT VERIFIED (M4, M15) | `GET /connectors/key=...` never called. |
| Deployment | Deploy success verified from logs and the registered resource | NOT VERIFIED (M4, M15) | `finalize` greps logs in code (unit-tested); never run for real. |
| Deployment | Code update chain (tag, setRepository, publish, redeploy updateConnector) | NOT VERIFIED (M15, M13) | `connect.mjs update-code` unit-tested with a fake CLI only; no rehearsal tag was pushed. |
| Deployment | Connector README documents stance, scopes, config table, poison/replay | PASS (local) for the content and for the automated check in the development tree | README sections exist (C10 ok); `check-docs-claims --certify --citations --stale` exits 0 (C11); `--scrub` is also green after the three internal-path lines in `e2e/README.md` were rewritten at the source (r2-docs). |
| Deployment | Certification reviewed for public listing | PASS-WITH-EXCEPTION (defer) | Owner decision Q14: sandbox and private connector, no certification for v1; backlog item B-03. |
| Customizations | App vs view chosen deliberately | PASS (local) | Two Custom Applications and one Custom View in `connect.yaml` (C9); proposals R and S. |
| Customizations | Config uses `${env:...}` placeholders, no hard-coded per-project values | PASS (local) | `check-connect-layout` and the lint warnings on `${env:` strings are intentional (B notes); C9. |
| Customizations | Run and tested locally incl. the non-admin path | NOT VERIFIED (M8, M10) | Wire tests cover the 403 `ADMIN_REQUIRED` path (C1); E2E-O-03, E2E-V-03, E2E-V-12 NOT RUN. |
| Security | Administrator access decided only by user id in `ADMIN_USER_IDS`; no permission group | PASS (local) for code and registration config; NOT VERIFIED on the staging deployment | See `admin-access.md`. Empty list fails closed (D tests, C1); app configs declare only the default View/Manage pair (C19). Deployment configuration, E2E-V-03/V-12/V-13 NOT VERIFIED (M4, M10, M15). |
| Structure | Shared code in `shared/` | PASS-WITH-EXCEPTION | Frontend builds transpile only each app's own source folder; shared files are duplicated and guarded by `check-duplicates.mjs` (C9, 27 groups); explained in `docs/architecture.md`. |
| Deployment | Two-phase deploy documented and scripted | PASS (local) for scripts and docs | `connect.mjs deploy`/`finalize` unit tests (C7); U2 (does a configuration redeploy rebuild the frontends) is an open platform fact, NOT VERIFIED (M15). |
| Deployment | Descriptions on every configuration key (skill: validate before staging) | PASS (local) | Same evidence as the "Every key has a description" row. |
| Operations | Rollback documented | PASS (local) for the text; NOT VERIFIED rehearsal | `docs/deployment-runbook.md` section 5 "Rollback". Rehearsal (task 5.4) NOT RUN (M15). |
| Operations | Data retention stated | PASS (local) | Keep-forever decision in README and `docs/operations.md`. |
| Operations | Secret rotation documented | PASS (local) | `docs/configuration.md` and `docs/operations.md`; `ENCRYPTION_KEY` rotation is a manual redeploy (W question 7). |
| Security | Third-party provider keys are configuration only | PASS (local) | J tests; `GET /service/mcp/providers` returns names and booleans only. |
| Operations | Anonymous clone builds | NOT VERIFIED (M1, M13) | X ran a partial proof in a scratch copy (frontends skipped in run 2, `connect validate` skipped); no unqualified `ALL STEPS PASSED` log exists. |
