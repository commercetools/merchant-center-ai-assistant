## ADDED Requirements

### Requirement: A to Z acceptance table
The release SHALL be accompanied by an acceptance table with one row for each change A to X and Z (and T when unblocked, otherwise a row stating "not part of v1: Q1 decision") giving: change id, archived yes/no with archive path, the commands that were run with exit codes, the Chrome scenario ids executed with status, the artefacts produced, and the verifier. No row SHALL be accepted without evidence.

#### Scenario: Aggregation
- **WHEN** `node scripts/release/acceptance.mjs --check` runs
- **THEN** it exits 0 only if every required change directory exists under `openspec/changes/archive/` and every row has evidence links that exist

#### Scenario: Missing archive
- **WHEN** a required change is not archived
- **THEN** the script exits non-zero and names the change

### Requirement: Connect production-readiness checklist applied
Every item of the "Production-readiness checklist (the gate)" of the `commercetools-connect` skill, the deployment checklist and the Merchant Center customizations checklist SHALL be recorded as PASS with proof, or NOT APPLICABLE with the technical reason, and no item SHALL be left unrecorded.

#### Scenario: All boxes recorded
- **WHEN** the checklist document `plans/evidence/z/readiness.md` is parsed
- **THEN** each item has a status of PASS or NOT APPLICABLE and a proof reference (command output, scenario id, file path or doc URL)

#### Scenario: Not-applicable reasons
- **WHEN** an event-related item (idempotent redelivery, envelope validation, message-type filtering, self-change filtering, poison-message replay) is marked NOT APPLICABLE
- **THEN** the reason states that the connector has no Subscription, API Extension or job application, proven by an empty `GET /{projectKey}/extensions` and `GET /{projectKey}/subscriptions` result on the sandbox deployment

### Requirement: Administrator access verified on the staging deployment
The release SHALL verify the administrator model on the staging (sandbox) deployment built from the release tag: the standard configuration key `ADMIN_USER_IDS` is set to the admin user's user id only (bootstrapped through the "Your user ID" line and `configure`), the admin user is an administrator and the non-admin user is not, and the permission list of every registered Custom Application and the Custom View contains no assistant-admin permission group (only the default View/Manage pair).

#### Scenario: ADMIN_USER_IDS configured
- **WHEN** the deployment configuration of the staging deployment is read (names and non-secret values)
- **THEN** `ADMIN_USER_IDS` is present and contains the admin user's id and not the non-admin user's id

#### Scenario: Admin and non-admin rehearsal
- **WHEN** E2E-V-03, E2E-V-12 and E2E-V-13 run on the staging deployment with the admin user and the non-admin user
- **THEN** the admin user reaches `isAdmin: true` after the bootstrap and refresh, the non-admin user stays false and receives 403 `ADMIN_REQUIRED` on admin routes, and forged e-mail, label or header hints grant nothing

#### Scenario: No permission group registered
- **WHEN** the registered applications' permission lists are inspected (Merchant Center application settings or the `permissions` of each `custom-application-config.mjs`)
- **THEN** only the default `Manage<EntryPoint>` / `View<EntryPoint>` pair exists and no assistant-admin group appears

### Requirement: Owner requirements trace
Requirements R1 to R10 of `plans/00-overview.md` SHALL each be traced to concrete evidence (change ids, checks, scenario ids, report files) in `plans/evidence/z/requirements-trace.md`, and a requirement without evidence SHALL block the release.

#### Scenario: R-by-R proof
- **WHEN** the trace file is read
- **THEN** R1 cites the traceability lint of change V, R2 the `commercetools connect validate` output and the readiness table, R3 removed (no longer applicable), R4 the leak/word scan, R5 the publication gate result `CLEAR`, R6 the absence of `.github/workflows`, R7 the persistence scenarios and the Firestore grep, R8 the base64 credential scenarios, R9 the E2E report, R10 the tasks-shape lint

### Requirement: Junior-developer plan shape verified
Every archived `tasks.md` SHALL contain the sections "Read first" (or "0."), setup commands, tasks with Why/Where/How/Done when/Watch out, a verification section and a docs-to-update section, as checked by `scripts/release/check-tasks-shape.mjs`.

#### Scenario: Shape lint
- **WHEN** `node scripts/release/check-tasks-shape.mjs` runs over `openspec/changes/archive/*/tasks.md`
- **THEN** it exits 0 and prints a count of checked files, tasks and missing-field findings equal to zero

### Requirement: Full regression and anonymous proof
Before tagging, the complete E2E suite (change V) SHALL pass on the Connect sandbox deployment built from the single public commit, and an anonymous clone of that commit SHALL install, typecheck, test and build all four applications and pass `commercetools connect validate`.

#### Scenario: Sandbox run
- **WHEN** the regression order of change V is executed against the sandbox deployment created from the tagged public repository
- **THEN** `report.md` shows no FAIL, and every SKIPPED row names a missing manual step

#### Scenario: Anonymous clone
- **WHEN** the public repository is cloned into an empty directory without credentials and the build commands are run
- **THEN** all exit with status 0

### Requirement: Version and tag
The release SHALL be version `0.1.0`: every `package.json` version, the `CHANGELOG.md` entry and the git tag `v0.1.0` SHALL agree, the tag SHALL be created on the public repository only after the publication gate prints CLEAR, and `connectorstaged` SHALL reference the public URL and that tag.

#### Scenario: Version agreement
- **WHEN** `node scripts/release/acceptance.mjs --versions` runs
- **THEN** all four `package.json` versions equal `0.1.0` and the first CHANGELOG heading is `0.1.0`

#### Scenario: Tag before gate
- **WHEN** the gate has not printed CLEAR
- **THEN** the release procedure refuses to create or push the tag

### Requirement: Handover notes
Handover notes SHALL be delivered to the owner stating: what was built, how to deploy and redeploy, where each secret lives and how to rotate it (with the known limits of rotating `ENCRYPTION_KEY`, that third-party provider credentials are Connect configuration rotated by a configuration redeploy, and how to find a user id and add or remove an administrator by changing `ADMIN_USER_IDS`), the data-retention statement (messages and feedback are kept until deleted), how to read logs, how to run the E2E suite, how to add a tool source or a locator, known limitations, and who to ask.

#### Scenario: Notes complete
- **WHEN** `plans/evidence/z/handover.md` is checked against the required headings
- **THEN** every heading exists and contains concrete commands or file paths

### Requirement: Open-items register
Every unresolved item from every change (open questions, skipped scenarios, deviations, deferred tasks, unverified claims) SHALL be listed in `plans/evidence/z/open-items.md` with source change, description, impact, decision needed, owner and target (v0.1.x, backlog or won't fix); the release SHALL NOT proceed while an item tagged "blocks release" is open.

#### Scenario: Register completeness
- **WHEN** the register is compared with the "Open questions" sections of all archived designs and the SKIPPED rows of the E2E report
- **THEN** each of them appears in the register

### Requirement: Post-v1 backlog
The post-v1 backlog SHALL list at least: an optional message and feedback retention job (Connect `job` application; not planned, built only if the owner reverses the keep-forever decision), identity token exchange via jwt-bearer if the authorization server ever advertises it, public marketplace certification, performance and accessibility testing, extraction of shared frontend code if Connect or the application kit supports it, additional locators, internationalisation, and metrics/alerting, each with rationale and a rough size.

#### Scenario: Backlog present
- **WHEN** `plans/evidence/z/backlog.md` is read
- **THEN** it contains the items above with rationale

### Requirement: Rollback readiness
The release SHALL document and rehearse rollback: redeploying the previous tag with `updateConnector`, deleting the deployment, and the data left behind in Custom Objects, and the rehearsal result SHALL be recorded.

#### Scenario: Rehearsal
- **WHEN** the sandbox deployment is redeployed from the previous staging tag
- **THEN** `/service/status` answers 200 and the stored sessions are still readable
