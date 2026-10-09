## ADDED Requirements

### Requirement: The publication tree is built from tracked files only and excludes internal paths
The publication directory SHALL be created from `git archive HEAD` of the development repository (so untracked and ignored files cannot enter), after which every path listed in `scripts/internal-paths.json` SHALL be removed. The resulting tree SHALL contain no agent configuration folder, no agent instructions file, no internal gate wrapper, no internal tooling folder, no internal path manifest, none of the planning working files named in that list (run evidence, question inboxes, person-addressed question and step lists, the amendments log), no `.github/` directory, no `Dockerfile*` and no `netlify.toml`. The folders `plans/` and `openspec/` SHALL remain, in scrubbed form (see the scrub requirements), and SHALL contain the neutral replacement documents `plans/decisions.md`, `plans/prerequisites.md` and `plans/design-history.md`.

#### Scenario: Internal paths are gone
- **WHEN** `node scripts/internal/prepare-publish.mjs --out "$PUB" --stage archive` completes
- **THEN** every path of the internal list is absent from `$PUB`, `plans/` and `openspec/` are present, and the script exits 0

#### Scenario: An untracked secret cannot leak
- **WHEN** an untracked file `service/.env.local` exists in the development repo
- **THEN** it is absent from `$PUB` because only `git archive` output is used

#### Scenario: Neutral replacements exist
- **WHEN** the archive stage finishes
- **THEN** `plans/decisions.md`, `plans/prerequisites.md` and `plans/design-history.md` exist in `$PUB` and the working-note files they replace (listed in the internal path manifest) do not

### Requirement: Planning and specification documents are scrubbed before publication
`plans/` and `openspec/` (including `openspec/changes/archive/**` and `openspec/specs/**`) are published as project documentation of the design (decision Q16, 2026-10-09). Before the single commit, the script `scripts/internal/scrub-docs.mjs` SHALL be run on the publication directory (never on the development repository) and SHALL: (a) apply the mechanical substitutions listed in the design (absolute local paths, names of private repositories and organisations, deployed-host examples, internal tooling paths, person-addressed wording, evidence-folder references, file-and-line citations of the legacy implementation, framing words); (b) rename the "legacy file" columns of source-map tables to "Origin" and reduce each cell to a neutral description; (c) rewrite path references to the three neutral replacement documents; (d) print a report of every substitution count per file and a list `NEEDS-HUMAN path:line reason` for each line that still matches a block pattern, cites an inbox-local question id that has no definition in `plans/decisions.md`, or contains a first or second person address to a named person. The script SHALL exit 1 while `NEEDS-HUMAN` lines remain. Text that is wrong to publish SHALL be fixed in the development repository (the owning change) and the whole procedure re-run; hand edits to `$PUB` are forbidden.

#### Scenario: Mechanical substitutions
- **WHEN** a file contains an absolute path into the legacy implementation with a line citation
- **THEN** after the scrub the file contains the phrase `the legacy multitenant implementation (not public)` in its place and the report counts one `absolute-path` substitution

#### Scenario: Unresolved text blocks
- **WHEN** a line still contains a private repository name that no substitution covers
- **THEN** the scrub prints `NEEDS-HUMAN path:line private-name` and exits 1

#### Scenario: Scrub only touches the publication copy
- **WHEN** the scrub runs
- **THEN** `git -C <development repo> status --porcelain` is unchanged and the target directory is under `$PUB`

#### Scenario: Idempotent
- **WHEN** the scrub is run a second time on `$PUB`
- **THEN** it reports zero substitutions

### Requirement: Neutral decision log, prerequisites and design history replace the working notes
The published tree SHALL NOT contain the person-addressed question list, the manual-steps list, the question inboxes, the run evidence folder or the amendments log. In their place the development repository SHALL contain (and publish) `plans/decisions.md` (every decided question, id kept, written as "Decision/Rationale/Affects", no person-addressed wording, no open questions to a named person), `plans/prerequisites.md` (every manual step, id kept, as "Prerequisite/Who needs it/Details", neutral roles such as "maintainer" and "org admin") and `plans/design-history.md` (the table of corrections and amendments, without references to private repositories). Inbox-local question ids that point to deleted inboxes SHALL NOT remain in any published file.

#### Scenario: No working notes
- **WHEN** `find "$PUB/plans" -maxdepth 2 -name '*questions*' -o -name '*manual*' -o -name '*inbox*' -o -name '*evidence*' -o -name '*amendments*'` runs
- **THEN** it prints nothing

#### Scenario: Ids still resolve
- **WHEN** a published `tasks.md` mentions decision `Q16` or prerequisite `M12`
- **THEN** `plans/decisions.md` contains a heading or row for `Q16` and `plans/prerequisites.md` for `M12`

### Requirement: Task status and archived changes are published as they are
Published `tasks.md` files SHALL keep their checkboxes exactly as they stand at publication (every task `[x]` after the change is implemented and archived; unticked tasks of the not yet archived changes X and Z remain unticked); no status line, timestamp or run log SHALL be added. All changes except X and Z SHALL be archived with spec sync (`openspec archive <id> --yes`) before publication, so `openspec/specs/` holds the capability specs and `openspec/changes/archive/` holds the scrubbed history; `openspec/changes/` otherwise contains X and Z and a `.gitkeep`. Change Z archives X and Z in the public repository after the release (a normal follow-up commit).

#### Scenario: Checkboxes are not rewritten
- **WHEN** the scrub finishes
- **THEN** the number of `- [x]` and `- [ ]` lines per `tasks.md` equals the number before the scrub

#### Scenario: Specs are synced
- **WHEN** `ls "$PUB/openspec/specs"` runs
- **THEN** it lists the capability folders and `openspec/changes/archive/` holds one folder per archived change

### Requirement: The scrubbed tree still validates
After the scrub, `openspec validate --all --strict` SHALL pass on `$PUB` and `node scripts/check-repo-rules.mjs --docs --strict` (change A) SHALL report zero findings. Both SHALL be the last checks before the single commit is made.

#### Scenario: OpenSpec validation after the scrub
- **WHEN** `cd "$PUB" && openspec validate --all --strict` runs after the scrub
- **THEN** it exits 0 (every change and spec is valid)

#### Scenario: Docs hygiene is zero
- **WHEN** `node scripts/check-repo-rules.mjs --docs --strict` runs in `$PUB`
- **THEN** it prints `docs hygiene: 0 finding(s)` and exits 0

### Requirement: ossify is applied and is idempotent
`ossify.mjs --apply --year <year>` SHALL be run on the publication directory exactly once by the script, after a dry run whose report is saved. A second dry run afterwards SHALL report `0 headered` and `0 package.json renamed`, no foreign-copyright refusals and no third-party directories. Every `package.json` SHALL then be named `@commercetools-labs/ai-assistant[-suffix]` and SHALL carry `repository`, `bugs` and `homepage` fields pointing at `https://github.com/commercetools/ai-assistant`.

#### Scenario: Second run is a no-op
- **WHEN** the dry run is repeated after apply
- **THEN** its report shows `0  headered` and `0  package.json renamed`

#### Scenario: Names are scoped
- **WHEN** `node -e` lists the `name` of every package.json in the publication tree
- **THEN** each starts with `@commercetools-labs/ai-assistant`

### Requirement: Repository-specific leak check passes
`scripts/internal/leak-check.mjs` SHALL scan EVERY text file of the publication tree, including all of `plans/` and `openspec/` (binary files skipped), for (a) customer and prospect names loaded at run time from the private `policy.json` located through `LABS_PUBLISH_DIR`, (b) a BLOCK list stored in `scripts/internal/leak-patterns.json` (classes: absolute local paths; names of the private legacy repositories and the internal organisation; tunnel and deployed-service hosts; internal GCP project ids and store identifiers from the maintainer-supplied private list; the impersonation-key setting name and the other gate-internal identifiers; the agent configuration folder, the agent instructions file, the internal gate wrapper, the internal path manifest, the question-inbox and evidence folder names; person-addressed phrases; personal e-mail addresses), and (c) a REVIEW list (the words `tenant`, `multitenant`, `Firestore`, `Cloud Run`, framing words, the legacy widget bootstrap word). BLOCK hits SHALL fail the run and the BLOCK count SHALL be zero; REVIEW hits SHALL be printed with file and line and each decided (reword or accept with a written reason). The pattern files SHALL be written so that no pattern line matches itself (character-class escapes such as `ngro[k]`) and SHALL never be part of the publication tree.

#### Scenario: Block hit
- **WHEN** any file of the tree, including a `tasks.md`, contains a deployed tunnel host
- **THEN** leak-check exits 1 and prints file, line and the matching pattern

#### Scenario: Documentation is scanned like code
- **WHEN** `openspec/changes/archive/<change>/design.md` contains an absolute path into a private repository
- **THEN** leak-check reports `BLOCK` for that file

#### Scenario: Review hit is listed not hidden
- **WHEN** `plans/design-history.md` contains the word `Firestore` in a migration note
- **THEN** leak-check exits 0 for that file but prints it under "REVIEW" so the maintainer can accept or rewrite it

### Requirement: History is a single fresh commit
The publication directory SHALL be initialised with `git init -b main` (never by copying `.git`), SHALL be reviewed with `git add --dry-run .` (the listing saved to evidence and checked against a forbidden-pattern list), and SHALL contain exactly one commit (`git rev-list --count HEAD` equals 1). A defect found afterwards SHALL be fixed by rebuilding from scratch, never by a fix-up commit.

#### Scenario: One commit
- **WHEN** the script finishes
- **THEN** `git -C "$PUB" rev-list --count HEAD` prints `1`

#### Scenario: Dry-run listing is clean
- **WHEN** the `git add --dry-run .` listing is checked
- **THEN** it contains no path matching `(^|/)\.env($|\.)`, `node_modules/`, `/build/`, `/public/`, `\.log$`, `\.DS_Store`, `\.pem$`, `\.key$`

### Requirement: The blocking gate is clean on the commit that will be pushed
`gate.mjs --repo "$PUB"` SHALL exit 0 and print `CLEAR` with zero failures. Every WARN SHALL be read and either fixed or acknowledged with `--ack`; the acknowledged warnings SHALL be listed with a one-line reason in the publication evidence file. The gate SHALL be the last step before the push and SHALL be re-run if anything changes.

#### Scenario: Clean gate
- **WHEN** `scripts/internal/prepare-publish.mjs --gate` runs the private gate
- **THEN** the output ends with `CLEAR` or `CLEAR (warnings acknowledged)` and the exit code is 0

#### Scenario: Dirty tree refused
- **WHEN** a file in `$PUB` is modified after the commit
- **THEN** `gate.mjs` refuses to run (exit 2) and the procedure restarts from the archive step

### Requirement: Anonymous-clone proof
A clone of the single commit into an empty directory, run with a scrubbed environment (no `.env` files, no `LABS_PUBLISH_DIR`, no cloud credentials), SHALL succeed in: `npm ci && npm run build && npm test` in `service/`; `yarn install --frozen-lockfile && yarn typecheck && yarn build` in each of `mc-app/`, `composed-apps/`, `mc-view-app/`; `npm ci --prefix scripts && node --test scripts/tests/*.test.mjs`; `node scripts/spdx-check.mjs`; `node scripts/check-repo-rules.mjs`; `node scripts/check-connect-layout.mjs`; and `commercetools connect validate`.

#### Scenario: Service builds from scratch
- **WHEN** `anon-proof.sh` runs the service steps in the clone
- **THEN** build and tests exit 0 without any environment variable from the development machine

#### Scenario: Renamed packages still install
- **WHEN** ossify has renamed `package.json` names but the lockfile still carries the old name
- **THEN** `npm ci` still succeeds (verified locally with npm 10) and the proof records the result

### Requirement: Public-first publication with manual, approved steps
The repository SHALL be created public from the start (`gh repo create commercetools/ai-assistant --public ...`), never created private and flipped. The commands for repository creation, push, labs property (`commercetools-labs=true`) and the `labs` topic SHALL be written in the runbook marked `[MANUAL M1]`, `[MANUAL M2]` and `[MANUAL M12]`; they SHALL be executed only after the maintainer's explicit approval of the LICENSE holder text, the README banner, the removal of the internal paths and the read-through of the scrubbed `plans/` and `openspec/` report.

#### Scenario: No private-then-public
- **WHEN** the runbook is read
- **THEN** it contains no `--private` and states that a force-push does not remove previously public commits

#### Scenario: Approval gate
- **WHEN** the person publishing reaches the `gh repo create` step
- **THEN** the checklist has an unticked "M12 maintainer approval recorded" box that blocks the step

### Requirement: Post-publication verification and rollback
After the push, a clone from `https://github.com/commercetools/ai-assistant.git` into an empty directory SHALL be built as in the anonymous proof and the labs property and topic SHALL be confirmed with `gh api`. If any leak is discovered after the repository is public, the runbook procedure SHALL be: delete the repository, rotate any exposed credential, rebuild the publication from scratch, and recreate the repository, accepting that the name is held by GitHub's rename redirect until the deletion completes.

#### Scenario: Post-publish clone
- **WHEN** the post-publication verification runs
- **THEN** `git clone https://github.com/commercetools/ai-assistant.git` followed by the proof commands succeeds and `gh api repos/commercetools/ai-assistant/properties/values` lists `commercetools-labs` = `true`
