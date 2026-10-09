# Change Z (z-release-verification): implementation notes

## Summary

Branch `worktree-agent-af2b7ca07ffe344f4`, reset to `develop` (`4925e1c`) first. Z is the final acceptance; on this tree it can only report the truth: **v0.1.0 is not releasable yet**. Everything that could be run without Docker, a Connect deployment, a Merchant Center login, Chrome, Google credentials, a scratch project or owner approval was run and passes (with two honest exceptions below); everything else is NOT VERIFIED with its manual step id. No tag, push, repository, publication or legacy-repository change was made.

Built:
- `scripts/release/acceptance.mjs` (`--table`, `--check`, `--versions`; verdicts only from a hand-written evidence JSON, never invented; a change that is not archived, a FAIL scenario, a missing link, or a non-PASS verdict fails `--check`) and `scripts/release/check-tasks-shape.mjs`, with 14 `node:test` tests (`acceptance.test.mjs`, `check-tasks-shape.test.mjs`).
- Tracked deliverables in `plans/implementation/z-release/`: `acceptance.md` (generated), `acceptance-evidence.json`, `readiness.md`, `requirements-trace.md`, `open-items.md`, `backlog.md`, `handover.md`, `admin-access.md`, `release-log.md`, `blocked.md`, `command-log.md`. The same files were copied to the git-ignored `plans/evidence/z/` (with raw logs in `plans/evidence/z/logs/`).
- Small doc edits owned by Z task 10: README status line (`version 0.1.0`), a "Rollback" section in `docs/operations.md` (states it is not rehearsed).
- Ticked in `tasks.md`: 0.1, 0.4, 1.2, 2.1, 2.2, 3.1, 4.1, 5.1, 7.1, 8.1, 8.2 (11 of 29).

Commands run (full table in `plans/implementation/z-release/command-log.md`):
- service: `npm ci`, build, test (170 suites, 1533 tests), lint (0 errors, 55 warnings), `commercetools connect application build` and `test`: all exit 0.
- mc-app, composed-apps, mc-view-app with `.env.example` exported: `yarn install --frozen-lockfile`, typecheck, lint, test (45, 25, 24 tests), build: all exit 0.
- root: 187 node tests (scripts, docs, release), 24 internal toolkit tests, `spdx-check`, `check-repo-rules`, `check-connect-layout`, `check-duplicates`, `check-versions`, `check-frontend-leftovers`, `gen-config-table --check`, `check-links`, `check-api-doc`, `extract-scenario-ids --lint --dangling --trace --tiers`, `openspec validate --all --strict` (24 passed): exit 0.
- Red: `check-docs-claims --scrub` (3 internal-path mentions in `e2e/README.md`); `check-tasks-shape.mjs` (24 files, 774 tasks, 172 errors, 378 warnings); `acceptance.mjs --check` (nothing archived, no PASS verdict); `commercetools connect validate` (exit 2, Docker daemon not running).
- `acceptance.mjs --versions 0.1.0` prints OK (the four `package.json` files and the first CHANGELOG heading were already 0.1.0).

Release verdict: **blocked.** Blockers: no change is archived; no E2E run exists (R9); `connect validate` never ran (M14); no sandbox deployment so U1-U10, live non-applicable proof, admin rehearsal, rollback rehearsal and anonymous-clone proof are all open; publication gate not CLEAR (61 NEEDS-HUMAN lines, 17 warnings, M12); R10 shape lint fails; several security/privacy owner decisions pending (see `open-items.md`).

## Questions (for the owner)

1. R10: `check-tasks-shape.mjs` finds 172 tasks without all five labels (378 more are compressed single-line tasks, reported as warnings). Do you want these tasks rewritten through `/opsx:update`, or accept the compressed form and relax the rule? The spec asks for zero findings.
2. May the Z registers use the verdict word PARTIAL and the status NOT VERIFIED? The spec only knows PASS and NOT APPLICABLE; I refused to write PASS without deployed evidence.
3. Where should the internal evidence archive live (RQ13)? I did not write anything outside the worktree.
4. Please batch the owner steps in one message (task 3.3): M1, M2, M3, M4, M5, M6, M7, M8, M10, M11, M12, M13, M14, M15, M16, M21, M22 plus the decisions marked "blocks release" in `open-items.md` (RQ10 security contact, Q-Q5 readable system prompt, OQ-J2 SSRF guard, Gravatar and `userLabel` privacy, scope breadth Q-O2/RQ4, Q-D2 entry-point path).
5. Version `0.1.0` was already set by earlier changes (W): confirm RQ12 (default `0.1.0` / `v0.1.0`, private connector) so nobody changes it.

## TODOs

- Tasks 0.2, 0.3, 0.5, 1.1, 3.2, 3.3, 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.2, 8.3 stay open; each needs the manual steps listed in `release-log.md`, `blocked.md` and `admin-access.md`.
- Task 4.2 static half done (no `applicationType: event|job` in `connect.yaml`); the live `GET /extensions` and `/subscriptions` half is open (M4, M15).
- Task 4.4: `gen-config-table --check` and the scope grep were run; the leak check on the published tree belongs to X.
- Task 0.2: the Connect skill checklists were not re-read; the readiness table was built from the checklist rows in `design.md`. Skim them against the skill (version 0.47.0 noted in the design) before a final sign-off.
- After the owner steps: run `plans/implementation/z-release/release-log.md` top to bottom; fill `acceptance-evidence.json` with real verdicts and links; rerun `acceptance.mjs --table --evidence plans/implementation/z-release/acceptance-evidence.json --out plans/implementation/z-release/acceptance.md --copy plans/evidence/z/acceptance.md` and `--check`.
- The internal evidence archive (`tar czf ... plans/evidence`) was deliberately not created.
- Re-run the verification commands once everything is archived; this run is a snapshot of the unarchived tree.

## Deviations from the spec (with reason)

- Branch: harness worktree branch, not `spec/z-release-verification`.
- Deliverables are written to `plans/evidence/z/` as the spec says and also tracked in `plans/implementation/z-release/` because `plans/evidence/` is git-ignored by design (and `plans/implementation/` is listed in `scripts/internal-paths.json`, so it reaches `develop` but is not published).
- `acceptance.mjs` verdicts come from `acceptance-evidence.json` (D7: "a human or agent supplies the evidence links"). Default location is `plans/evidence/z/acceptance-evidence.json`; `--evidence <file>` overrides it. Extra options `--out`, `--copy`, `--root`. The table has a `note` column. A verdict other than PASS is a `--check` finding, so `--check` cannot pass before real evidence exists.
- Scenario status parsing reads `| E2E-... | ... | status |` rows (the format `scripts/e2e/report.mjs` writes); with no report every scenario is NOT RUN.
- `--versions` takes the version as an optional argument (`--versions 0.1.0`, default 0.1.0) and also accepts `--root`.
- `check-tasks-shape.mjs` treats "compressed" tasks (a single line, no label lines) and tasks in the read-first or setup sections as warnings, per the spec's allowance for compressed and shared tasks; any other task missing a label is an error. Labels match as `**Why:**` anywhere in a task or `Why:` at the start of a line. Archived files plus active changes are scanned (the archive is empty today). It does not judge quality.
- Test command: `node --test scripts/release/*.test.mjs` instead of `node --test scripts/release/` (a directory argument fails on Node 22, as A, B, W and X noted).
- Readiness statuses: PASS (local), NOT APPLICABLE, PASS-WITH-EXCEPTION, NOT VERIFIED (Mxx) instead of only PASS/NOT APPLICABLE/FAIL, because nothing was deployed. The spec scenario "every item PASS or NOT APPLICABLE" is therefore not met, on purpose. Extra rows beyond the design table: two-phase deploy, rollback, retention, rotation, provider keys, anonymous clone.
- No `sandbox-findings.md`: every item of task 3.2 is NOT VERIFIED, so it is section 2 of `open-items.md` instead of a separate file.
- Task 8.3 (evidence tarball in the home directory) was not done: it would archive the evidence of one agent worktree outside the repository without the owner naming the location.
- README and `docs/operations.md` were edited (task 10), although they belong to W; no other change artifact was edited.

## Wrong or fragile spec text found (not edited)

- Z tasks 2.1 and V.1: `node --test scripts/release/` (directory form) fails on Node 22.
- Z design says archived changes carry `E2E-` ids and commands in a "Verification" section; the sections are free text (bullets and prose), so command extraction is heuristic (inline code starting with node, npm, yarn, commercetools, cd, openspec, bash or grep) and the id extraction knows `E2E-X-NN` and `..` ranges.
- Z spec "Junior-developer plan shape" asks for exit 0 over archived `tasks.md`; the archive does not exist yet, so the check was run on the active changes.
- Z design table says T is optional and Y reserved: shown as NOT REQUIRED rows in the acceptance table.
- X's notes list Q7 (archiving is a maintainer action): no agent archived anything here either.
- The service integration tests (`npm run test:integration`) were not run (they need a scratch project, M3).

## Security notes of this run

- No secret was read or written. `commercetools auth whoami` printed an authenticated CLI session; it was not used for any action and its output is not kept in any file.
- No absolute local path, customer name, internal host name or `.env` file was added to a tracked file; the raw logs under `plans/evidence/z/logs/` are git-ignored.
