## 0. Read first

- [ ] 0.1 Read `proposal.md`, `design.md` (A to Z table, readiness table, R1-R10 trace, D1-D7) and `specs/release-verification/spec.md`.
- [ ] 0.2 Read the checklists in `/Users/behnam/.claude/plugins/marketplaces/commercetools/skills/commercetools-connect/SKILL.md` (section "Production-readiness checklist (the gate)", lines about 168-200), `references/deployment-installation.md` (Checklist), `references/merchant-center-customizations.md` (Checklist), `references/project-structure.md` (Checklist).
- [ ] 0.3 Read change X's archived artefacts (publication procedure, gate output, anonymous-clone proof) and change U's runbook `docs/deployment-runbook.md`.
- [ ] 0.4 Read `plans/manual-steps.md` and the manual-step amendments in `plans/manual-steps.md` (M1, M2, M4, M12, M13, M14, M15, M16).
- [ ] 0.5 Read `plans/evidence/` reports of every change and the latest change-V `report.md`.

You should now be able to explain: (a) what "not applicable" means for the event-related boxes and how it is proven, (b) the order of the release steps and why the tag is created last, (c) what blocks the release, (d) where evidence is stored and why it is internal.

## 1. Setup

- [ ] 1.1 Create folders and verify prerequisites.
  **Why:** one place for all release evidence.
  **Where:** `plans/evidence/z/` (git-ignored), `scripts/release/`.
  **How:** `git switch -c spec/z-release-verification`; `mkdir -p plans/evidence/z`; `openspec list --json | head -50`; `ls openspec/changes/archive`; confirm the development repository is clean: `git status --short | wc -l` prints `0`.
  **Done when:** folder exists; archive lists the changes expected by the table (T may be absent when No-go).
  **Watch out:** X's publication directory is separate (`$HOME/labs-publish/ai-assistant` by default) - never write evidence there.

- [ ] 1.2 Tooling check.
  **Why:** commands in later tasks need these.
  **How:** `node -v` (v22); `commercetools --version`; `docker info >/dev/null && echo docker-ok` (M14); `commercetools auth whoami` or equivalent after M4; `gh auth status` for the manual repository steps if the owner delegates them.
  **Done when:** each prints a version/OK or the missing manual step id is recorded in `plans/evidence/z/blocked.md`.
  **Watch out:** never print tokens.

## 2. Helper scripts (public, headered)

- [ ] 2.1 `scripts/release/acceptance.mjs`.
  **Why:** aggregate facts instead of hand-copying.
  **Where:** `scripts/release/acceptance.mjs`, test `scripts/release/acceptance.test.mjs`.
  **How:** modes: `--table` (for each of A..X, Z plus T: check `openspec/changes/archive/*-<name>` exists, read its `tasks.md` Verification bullets to collect commands and `E2E-` ids; find statuses of those ids in the newest `plans/evidence/*/report.md`; write `plans/evidence/z/acceptance.md` with columns id, change, archived, commands, scenario statuses, evidence links, verifier), `--check` (exit non-zero if any change not archived, any scenario FAIL, or any evidence link missing), `--versions` (read the four `package.json` and `CHANGELOG.md`; all must equal the version argument default `0.1.0`).
  **Done when:** `node --test scripts/release/` passes; `node scripts/release/acceptance.mjs --versions 0.1.0` prints OK on a fixture tree.
  **Watch out:** archive directory names may carry a date prefix - match by suffix.

- [ ] 2.2 `scripts/release/check-tasks-shape.mjs`.
  **Why:** R10.
  **Where:** `scripts/release/check-tasks-shape.mjs`, test file.
  **How:** for each `openspec/changes/archive/*/tasks.md` and active changes: require a heading matching `/^## (0\.|Read first)/`, a setup section (`/^## 1\. Setup/i` or contains "Setup"), a verification section (`/Verification/i`), a docs section (`/Docs to update/i`); count task bullets `- [ ] N.N`; for each task require the five labels `Why:`, `Where:`, `How:`, `Done when:`, `Watch out:` (allow tasks explicitly marked "Shared Where/How/Done/Watch" or compressed bullet lists under a shared paragraph, and report them as warnings); print totals.
  **Done when:** runs over the repo and prints counts; findings are listed as warnings or errors; exit 1 on errors.
  **Watch out:** some changes use `**Why:**` bold - match both.

## 3. Resolve what blocks before the final run

- [ ] 3.1 Build the open-items register.
  **Why:** decisions needed before the tag.
  **Where:** `plans/evidence/z/open-items.md`.
  **How:** 1. For every archived change extract "Open questions" (`awk '/^## Open questions/{f=1;next} /^## /{f=0} f' design.md`). 2. Add every SKIPPED/BLOCKED row of the E2E reports. 3. Add owner questions Q1-Q16 and their final answers. 4. Add W ledger deferred rows and unverified claims. 5. Table columns: id, source, description, impact, decision needed, owner, status, target (blocks release / v0.1.x / backlog / won't fix). Seed with design finding 5.
  **Done when:** every "Open questions" bullet of every design appears; each item has a target.
  **Watch out:** classify by D5; security-related items always block.

- [ ] 3.2 Close the blocking items that need the sandbox.
  **Why:** facts that could invalidate a design.
  **Where:** `plans/evidence/z/sandbox-findings.md`.
  **How:** on the sandbox deployment run the checks named in the register: OQ-K1/OQ-K5 (embedded Nimbus starts, status endpoint), OQ-H2 (stream not cut before 5 min; E2E-H-04), OQ-N2 (body limit end to end), OQ-I1/OQ-I2 (auth2 scope and refresh behaviour), Q-C1 (PORT), Q-O3 (yarn vs npm build), U10 of change U (a comma-separated `ADMIN_USER_IDS` arrives as one value and both ids are parsed). Record outputs (no secrets).
  **Done when:** each of those items is `resolved` with evidence or escalated to the owner with a default decision.
  **Watch out:** if a finding contradicts a spec, open `/opsx:update <change>` and re-run the affected scenarios; do not patch silently.

- [ ] 3.3 Owner decision batch.
  **Why:** the owner should be asked once.
  **How:** compile the register's owner-decision rows into one message listing item, default and consequence; wait for answers; record them verbatim.
  **Done when:** no owner-decision row is open.
  **Watch out:** manual steps M1, M2, M12, M13, M15 are asked in the same batch.

## 4. Readiness checklist proof

- [ ] 4.1 Create `plans/evidence/z/readiness.md` from the design table.
  **Why:** certification-grade evidence.
  **How:** copy the table; add columns Status (PASS / NOT APPLICABLE / PASS-WITH-EXCEPTION / FAIL) and Evidence (command + output path, scenario id, file path, doc URL).
  **Done when:** every row has a status.
  **Watch out:** a FAIL is a bug in the owning change, not a table edit.

- [ ] 4.2 Prove the non-applicable boxes.
  **Why:** "not applicable" needs facts.
  **How:** after the sandbox deployment is running, call the commercetools API with a read-only client (M4/M16): `GET /{projectKey}/extensions` and `GET /{projectKey}/subscriptions`, filter on keys starting `ai-assistant` and expect none; also `grep -nE "applicationType: (event|job)" connect.yaml` expecting no output. Save outputs.
  **Done when:** outputs saved and linked from the five event-related rows.
  **Watch out:** other resources in the project may exist; assert on this connector's keys only.

- [ ] 4.3 Collect deployment proofs.
  **Why:** deployment checklist boxes.
  **How:** `commercetools connect validate` (output saved); `commercetools connect deployment get --key <key>` (region equals project region); `commercetools connect deployment logs --key <key>` excerpt showing the `postDeploy` verification lines and JSON logs with correlation ids; compare live connector contract `GET /connectors/key=<key>` against `connect.yaml` keys; sample `deployment redeploy` partial-merge behaviour recorded from U.
  **Done when:** each deployment row cites a saved file.
  **Watch out:** redact tokens in logs.

- [ ] 4.4 Scope and secret checks.
  **How:** `node scripts/docs/gen-config-table.mjs --check README.md docs/configuration.md`; `grep -n "scopes" -A6 connect.yaml`; verify no `manage_project`; `grep -rnE "BEGIN (RSA )?PRIVATE KEY|client_secret" --exclude-dir=node_modules .` empty; the leak check from X reports CLEAR.
  **Done when:** outputs saved.
  **Watch out:** the grep must run on the published tree, not only the dev tree.

- [ ] 4.5 Administrator access proof.
  **Why:** spec "Administrator access verified on the staging deployment"; the admin model is the main security control.
  **Where:** `plans/evidence/z/admin-access.md`.
  **How:** 1. Read the staging deployment configuration (`node scripts/connect/connect.mjs` read command from change U, or `commercetools connect deployment get --key <key>`): `ADMIN_USER_IDS` present, contains user A's id only (write `<user-id-a>` in the evidence, never the real id; `adminConfigured` is true in `GET /service/status`). 2. Run E2E-V-03, E2E-V-12 and E2E-V-13 (own user ID line, bootstrap through `configure`, forged hints) on the staging deployment with the admin user and the non-admin user (change V, two Chrome profiles). 3. List the permissions of each registered app: Merchant Center -> Settings -> Custom Applications (screenshot with `take_screenshot`) or `grep -n "permissions" */custom-application-config.mjs */custom-view-config.mjs`; expect only the default `Manage<EntryPoint>` / `View<EntryPoint>` pair per app and `grep -rniE "assistant-admin|permission group" connect.yaml */custom-*-config.mjs docs README.md` empty. 4. Confirm the `ADMIN_USER_IDS is empty: no administrator` warning is absent from the deployment logs and that no e-mail appears in network responses other than the display-only label.
  **Done when:** the file links the three scenario results, the configuration check and the permission lists; all PASS.
  **Watch out:** a FAIL is a bug in change D, O or Q (open `/opsx:update`); do not edit `ADMIN_USER_IDS` on the staging deployment to make a scenario pass.

## 5. Version, changelog and release rehearsal

- [ ] 5.1 Set version 0.1.0.
  **Why:** spec "Version and tag".
  **Where:** `service/package.json`, `mc-app/package.json`, `composed-apps/package.json`, `mc-view-app/package.json`, `CHANGELOG.md`.
  **How:** set `"version": "0.1.0"` in all four; `CHANGELOG.md` heading `## 0.1.0` with the date and 5-8 bullet summary (no tenant vocabulary, no internal references); `node scripts/release/acceptance.mjs --versions 0.1.0`.
  **Done when:** prints OK.
  **Watch out:** lockfiles may embed versions (yarn.lock does not for the root package); run installs afterwards to confirm no diff.

- [ ] 5.2 Rehearse on the private staging repository (M15).
  **Why:** create the real tag once.
  **How:** push the single-commit tree prepared by X to the private staging repo; tag `v0.1.0-rc1`; `commercetools connect connectorstaged create --repository-url <staging> --repository-tag v0.1.0-rc1 ...` via change U scripts (`scripts/connect/...`); publish; create a sandbox deployment; run `finalize` (two-phase); record every command and output in `plans/evidence/z/release-log.md`.
  **Done when:** sandbox deployment is healthy (`/service/status` 200) and apps load.
  **Watch out:** rehearsal tags use `-rc`; never reuse `v0.1.0` here.

- [ ] 5.3 Full regression on the rehearsal deployment.
  **Why:** the release gate.
  **How:** run change V's regression order against the sandbox (tiers 0 to 8); store `report.md`; `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace`.
  **Done when:** no FAIL; SKIPPED rows each cite a missing manual step; flaky rows have a retry note.
  **Watch out:** destructive tier requires `E2E_ALLOW_DESTRUCTIVE=1` and the owner's consent.

- [ ] 5.4 Rollback rehearsal.
  **Why:** spec "Rollback readiness".
  **How:** create `v0.1.0-rc2` with a trivial text change in the README; update the deployment through the chain (`setRepository`, `publish`, `redeploy --updateConnector`); then redeploy back to rc1 the same way; verify sessions created before are still listed.
  **Done when:** `/service/status` 200 and an `e2e-` session from before is readable; steps saved.
  **Watch out:** this alters the sandbox only.

## 6. Final run on the real tag

- [ ] 6.1 Publish the public repository (manual steps M1, M2, M12) and tag.
  **Why:** the release.
  **How:** after the owner confirms M1, M2, M12: X pushes the single commit; run the gate once more on the pushed commit (`CLEAR` required); then `git tag v0.1.0 && git push origin v0.1.0` (M13).
  **Done when:** `git ls-remote --tags origin v0.1.0` shows the tag; the tag object commit equals the single commit.
  **Watch out:** refuse to tag when the gate does not print CLEAR (spec scenario "Tag before gate").

- [ ] 6.2 Anonymous clone proof.
  **How:** `rm -rf $TMPDIR/anon && git clone --depth 1 --branch v0.1.0 <public-url> $TMPDIR/anon && cd $TMPDIR/anon`; `cd service && npm ci && npm run build && npm test`; for each frontend `yarn install --frozen-lockfile && yarn typecheck && yarn lint && yarn test && yarn build`; `commercetools connect validate`.
  **Done when:** all exit 0 (output saved).
  **Watch out:** run from an empty directory without your credentials in the environment (`env -i PATH=$PATH HOME=$TMPDIR/h ...`) to prove nothing local is needed.

- [ ] 6.3 Stage, publish and deploy from the public tag.
  **How:** through `scripts/connect` (change U): `connectorstaged create` with the public URL and `v0.1.0`, `publish`, sandbox deployment, `finalize`; update Merchant Center URLs (M9); repeat tier 0-3 of the regression plus E2E-U-01..U-03.
  **Done when:** green; `release-log.md` complete.
  **Watch out:** this is the proof for R2; keep outputs.

## 7. Requirements trace and acceptance table

- [ ] 7.1 Fill `plans/evidence/z/requirements-trace.md` (R1-R10) with evidence links from design table; add one sentence per requirement stating how it was verified.
  **Done when:** every R has at least one existing evidence path.
  **Watch out:** R3 is no longer used; skip it in the trace table.

- [ ] 7.2 Generate and complete the acceptance table.
  **How:** `node scripts/release/acceptance.mjs --table && node scripts/release/acceptance.mjs --check`; fill missing verifier names and evidence links by hand; `node scripts/release/check-tasks-shape.mjs`.
  **Done when:** both exit 0.
  **Watch out:** do not edit statuses to make the check pass.

## 8. Handover and backlog

- [ ] 8.1 Write `plans/evidence/z/handover.md`.
  **Why:** the owner can operate without us.
  **How:** headings: What was built; Repository map; How to deploy/update/rollback (links to `docs/deployment-runbook.md`); Secrets inventory (names, where stored, how to rotate: `GCP_SA_KEY_BASE64` via redeploy with new value; `ENCRYPTION_KEY` limits - rotating invalidates stored identity tokens, users must reconnect; third-party provider keys (`CONTENTSTACK_API_KEY`, `CONTENTSTACK_MANAGEMENT_TOKEN`, `ALGOLIA_MCP_URL`, `STRIPE_SECRET_KEY` secured; `CONTENTSTACK_BRANCH`, `CONTENTSTACK_REGION`, `STRIPE_CONNECTED_ACCOUNT_ID` standard) are Connect configuration, rotated with `connect.mjs configure KEY=VALUE` (configuration redeploy); Connect API client secret); `ADMIN_USER_IDS` (standard configuration, not a secret: how to find a user's id ("Your user ID" line) and add or remove an administrator with `connect.mjs configure ADMIN_USER_IDS=...` and a configuration redeploy; takes effect when instances restart; empty means nobody is an administrator); Data retention (messages and feedback are kept until an operator deletes the Custom Objects; no automatic deletion; point to `docs/operations.md`); Logs and troubleshooting entry points; How to run the E2E suite; How to add a tool source / locator / agent; Known limitations (from the register); Contacts; Reserved letter Y; Where internal evidence is archived (RQ13).
  **Done when:** every heading has concrete commands/paths.
  **Watch out:** no secrets in the document.

- [ ] 8.2 Write `plans/evidence/z/backlog.md` from design D6 (the retention job is listed as not planned), add items found in 3.1, each with rationale and size.
  **Done when:** all D6 items present.
  **Watch out:** items already on the open-items register with target "backlog" must appear here.

- [ ] 8.3 Archive internal evidence.
  **How:** `tar czf $HOME/ai-assistant-release-evidence-v0.1.0.tgz plans/evidence` (the rest of `plans/` and `openspec/` is published as scrubbed design documentation by change X) (private location per RQ13); verify the archive lists `plans/evidence/z`.
  **Done when:** archive exists and size > 0.
  **Watch out:** never push this archive to a public place.

## 9. Verification

- Commands: `node scripts/release/acceptance.mjs --check`, `node scripts/release/check-tasks-shape.mjs`, `node scripts/e2e/extract-scenario-ids.mjs --lint --dangling --trace`, the anonymous clone commands (6.2), `commercetools connect validate`, the gate `CLEAR`.
- Unit tests: `node --test scripts/release/`.
- Chrome scenario ids executed in the final run: the full catalogue from change V on the sandbox deployment of the public tag, specifically **E2E-V-01** (preflight), **E2E-V-03** (non-admin user), **E2E-V-12** (forged e-mail, label or header), **E2E-V-13** (own user ID and administrator bootstrap), **E2E-V-04** (restart persistence), **E2E-V-05** (multi-instance), **E2E-V-06** (budget), **E2E-V-09** (cold start), **E2E-U-01 .. E2E-U-03**, and `E2E-T-*` only if T = Go.
- `openspec validate z-release-verification --strict`.

## 10. Docs to update

- `CHANGELOG.md` entry `0.1.0` (confirm text with W).
- README: "Status" line with version `0.1.0` and the link to SUPPORT.md.
- `docs/operations.md`: add the rollback procedure rehearsed in 5.4 (commands from U runbook).
- After release: tell change X's maintainers (owner) the location of the evidence archive; no repository docs reference it.
